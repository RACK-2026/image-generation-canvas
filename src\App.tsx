import { useState, useEffect, useCallback, useRef } from 'react';
import type { TaskRecord, GenParams, ApiConfig, AppSettings, FilterStatus, SizeConfig, GeneratedImage } from './types';
import { DEFAULT_PARAMS, DEFAULT_API_CONFIG, DEFAULT_SETTINGS } from './types';
import { saveTask, getAllTasks, deleteTask, clearAllTasks, savePipelineProgress, getPipelineProgress, clearPipelineProgress, savePipelineInput, getPipelineInput, clearPipelineInput } from './db';
import { enhancePrompt, generateImageBatch, createTaskRecord } from './api';
import { TopNav } from './components/TopNav';
import { Gallery } from './components/Gallery';
import { InputBar } from './components/InputBar';
import type { RefImage } from './components/InputBar';
import { SizeDialog } from './components/SizeDialog';
import { SettingsPanel } from './components/SettingsPanel';
import { ImagePreview } from './components/ImagePreview';
import { FavoritesView } from './components/FavoritesView';
import { InfiniteCanvas } from './canvas/InfiniteCanvas';
import { PipelineProgress } from './components/PipelineProgress';
import { FastPipeline } from './agents/fast-pipeline';
import type { AgentProgressEvent, ClassifiedImage, AgentOutput } from './agents/types';
import { getExperienceEngine } from './jingyan/engine';
import { getOrganizedAssets } from './assets-store/manager';
import { initVaultDirectory, isVaultReady as checkVaultReady } from './vault/vault-writer';
import { getCacheStats } from './vault/cache';

export default function App() {
  const [view, setView] = useState<'gallery' | 'canvas'>('gallery');
  const [showFavorites, setShowFavorites] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [params, setParams] = useState<GenParams>(DEFAULT_PARAMS);
  const [apiConfig, setApiConfig] = useState<ApiConfig>(DEFAULT_API_CONFIG);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [sizeConfig, setSizeConfig] = useState<SizeConfig>({
    mode: 'auto',
    baseResolution: '1K',
    ratio: '1:1',
    customWidth: 1024,
    customHeight: 1024,
  });
  const [showSizeDialog, setShowSizeDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingTaskId, setGeneratingTaskId] = useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = useState('');
  const [pipelineProgress, setPipelineProgress] = useState<AgentProgressEvent[]>([]);
  const [vaultReady, setVaultReady] = useState(false);
  const [cacheStats, setCacheStats] = useState<{ total: number; vision: number; extraction: number; planning: number } | null>(null);
  const engineRef = useRef(getExperienceEngine());

  // Load tasks on mount + restore pipeline progress
  useEffect(() => {
    loadTasks();
    restorePipelineProgress();
    // Check vault status
    setVaultReady(checkVaultReady());
    loadCacheStats();
  }, []);

  const loadCacheStats = async () => {
    try {
      const stats = await getCacheStats();
      setCacheStats(stats);
    } catch {
      // ignore
    }
  };

  const handleInitVault = async () => {
    const handle = await initVaultDirectory();
    if (handle) {
      setVaultReady(true);
      alert('知识库初始化成功！\n\n目录: ' + handle.name);
    }
  };

  const restorePipelineProgress = async () => {
    try {
      const saved = await getPipelineProgress();
      if (!saved) return;
      await clearPipelineProgress();

      const tasks = await getAllTasks();
      const task = tasks.find(t => t.id === saved.taskId && t.status === 'processing');
      if (task) {
        const completedSteps = (saved.events || []).filter((e: any) => e.status === 'success').length;
        task.status = 'interrupted';
        task.canResume = completedSteps > 0; // Can resume if at least 1 step completed
        task.failReason = `任务中断（已完成 ${completedSteps}/5 步，可继续生成）`;
        task.updatedAt = Date.now();
        await saveTask(task);
        setTasks(prev => prev.map(t => t.id === task.id ? { ...task } : t));
      }
    } catch (e) {
      console.warn('Failed to restore pipeline progress:', e);
    }
  };

  const loadTasks = async () => {
    const allTasks = await getAllTasks();
    let changed = false;
    for (const task of allTasks) {
      if (task.status === 'processing') {
        task.status = 'interrupted';
        task.canResume = true; // Assume resumable if pipeline input was saved
        task.failReason = task.failReason || '任务已中断，可继续生成';
        task.updatedAt = Date.now();
        await saveTask(task);
        changed = true;
      }
    }
    setTasks((changed ? allTasks : allTasks).sort((a, b) => b.createdAt - a.createdAt));
  };

  const handleSubmit = useCallback(async (prompt: string, referenceImages?: string[], _refImageRoles?: RefImage[]) => {
    if (!prompt.trim() || isGenerating) return;

    if (!apiConfig.apiKey) {
      alert('请先在设置中配置 API Key');
      setShowSettings(true);
      return;
    }

    setIsGenerating(true);
    setGenerationProgress('');

    const task = createTaskRecord(prompt, params, referenceImages);
    const strictComposition = Boolean(referenceImages?.length && apiConfig.strictComposition !== false);
    task.sourcePrompt = prompt;
    task.generationMode = strictComposition ? 'strict-composite' : 'standard';
    task.fidelityStatus = strictComposition ? 'pending' : 'not-applicable';
    task.fidelityWarnings = [];
    task.status = 'processing';

    await saveTask(task);
    setTasks(prev => [task, ...prev]);
    setGeneratingTaskId(task.id);

    const engine = engineRef.current;
    let enhancedPrompt = '';
    let finalPrompt = prompt;

    try {
      if (strictComposition && referenceImages?.[0]) {
        // Pipeline mode: 9-agent collaborative workflow
        setPipelineProgress([]);
        setGenerationProgress('启动多Agent流水线...');

        // Classify images by role
        const classifiedImages: ClassifiedImage[] = (_refImageRoles || []).map((ri, idx) => ({
          index: idx,
          base64: ri.base64,
          role: ri.role as ClassifiedImage['role'],
          label: ri.label || ri.role,
        }));
        // Ensure at least the first image is classified as main
        if (classifiedImages.length > 0 && classifiedImages[0].role !== 'main') {
          classifiedImages[0].role = 'main';
          classifiedImages[0].label = '主图';
        }

        task.prompt = `[多Agent流水线] ${prompt}`;
        await saveTask(task);
        setTasks(prev => prev.map(t => t.id === task.id ? { ...task } : t));

        // Save pipeline input for breakpoint resume
        const pipelineInput = {
          taskId: task.id,
          config: apiConfig,
          images: classifiedImages,
          userInput: prompt,
          params,
        };
        await savePipelineInput(task.id, pipelineInput);

        const pipeline = new FastPipeline((event) => {
          setPipelineProgress(prev => {
            const next = [...prev];
            const existing = next.findIndex(e => e.agentId === event.agentId);
            if (existing >= 0) next[existing] = event;
            else next.push(event);
            // Persist to IndexedDB
            savePipelineProgress(task.id, next, { progressText: `${event.agentName}: ${event.status}` });
            return next;
          });
          setGenerationProgress(`${event.agentName}: ${event.status === 'running' ? '执行中...' : event.status === 'success' ? (event.message === '缓存命中' ? '✅ 缓存命中' : '完成') : event.status === 'failed' ? '失败' : '等待中'}${event.message && event.message !== '缓存命中' ? ' (' + event.message + ')' : ''}`);
        });

        const result = await pipeline.run({
          taskId: task.id,
          config: apiConfig,
          images: classifiedImages,
          userInput: prompt,
          params,
        });

        if (result.finalImages.length === 0) throw new Error('未能生成任何图片');

        const images: GeneratedImage[] = result.finalImages.map(img => ({
          ...img,
          generationMode: 'strict-composite' as const,
          fidelityStatus: 'preserved' as const,
          fidelityWarnings: result.retries > 0 ? [`经过${result.retries}次重试`] : [],
        }));

        task.status = 'success';
        task.images = images;
        task.fidelityStatus = 'preserved';
        task.updatedAt = Date.now();
        await saveTask(task);
        setTasks(prev => prev.map(t => t.id === task.id ? task : t));

        // Record in experience engine
        engine.recordCase(
          prompt, prompt, result.outputs['planning']?.data?.prompt || '',
          { size: params.size, quality: params.quality },
          images.length, images.map(img => img.revised_prompt || ''), referenceImages
        );
        // Clear saved pipeline input (task complete, no need to resume)
        await clearPipelineInput(task.id);
        // Refresh cache stats
        loadCacheStats();
        return; // Pipeline mode complete
      }

      // Standard mode: AI prompt enhancement with experience injection
      if (apiConfig.enhancePrompt) {
        setGenerationProgress('AI分析意图中...');
        try {
          // Get user preference injection from experience engine
          const preferenceInjection = engine.getPreferenceInjection();
          const userInput = preferenceInjection
            ? `${prompt}\n\n用户历史偏好: ${preferenceInjection}`
            : prompt;
          finalPrompt = await enhancePrompt(apiConfig, userInput, undefined, referenceImages);
          enhancedPrompt = finalPrompt;
          task.prompt = `[原] ${prompt}\n[AI增强] ${finalPrompt}`;
          await saveTask(task);
          setTasks(prev => prev.map(t => t.id === task.id ? task : t));
        } catch (err: any) {
          console.warn('Prompt enhancement failed:', err.message);
        }
      }

      // Step 2: Generate 3 images (parallel individual requests)
      const imageCount = apiConfig.imageCount || 3;
      const genStartTime = Date.now();
      setGenerationProgress(`正在生成 0/${imageCount} 张...`);
      const generatedImages = await generateImageBatch(
        apiConfig, finalPrompt, params, imageCount, referenceImages,
        (_status, current, total) => {
          const elapsed = Math.round((Date.now() - genStartTime) / 1000);
          const avgPerImage = current > 0 ? elapsed / current : 30;
          const remaining = Math.round((total - current) * avgPerImage);
          const timeText = remaining > 0 ? ` 约${remaining}秒后完成` : '';
          setGenerationProgress(`正在生成 ${current}/${total} 张...${timeText}`);
        }
      );

      if (generatedImages.length === 0) throw new Error('未能生成任何图片');

      const images: GeneratedImage[] = generatedImages.map(image => ({
        ...image,
        generationMode: 'standard' as const,
        fidelityStatus: 'not-applicable' as const,
        fidelityWarnings: [],
      }));

      // Update task with results
      task.status = 'success';
      task.images = images;
      task.fidelityStatus = 'not-applicable';
      task.updatedAt = Date.now();
      await saveTask(task);
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));

      // Step 3: Record case in experience engine (feedback via gallery per-image buttons)
      const revisedPrompts = images.map(img => img.revised_prompt || '');
      engine.recordCase(
        prompt,
        enhancedPrompt,
        finalPrompt,
        { size: params.size, quality: params.quality },
        images.length,
        revisedPrompts,
        referenceImages
      );

    } catch (err: any) {
      task.status = 'failure';
      task.failReason = err.message;
      if (strictComposition) {
        task.fidelityStatus = 'failed';
        task.fidelityWarnings = [...(task.fidelityWarnings || []), err.message];
      }
      task.updatedAt = Date.now();
      await saveTask(task);
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
    } finally {
      setIsGenerating(false);
      setGeneratingTaskId(null);
      setGenerationProgress('');
      setPipelineProgress([]);
      clearPipelineProgress();
    }
  }, [params, apiConfig, isGenerating]);

  const handleDeleteTask = async (id: string) => {
    await deleteTask(id);
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const handleToggleFavorite = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    task.favorite = !task.favorite;
    await saveTask(task);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, favorite: task.favorite } : t));
  };

  const handleRetry = async (task: TaskRecord) => {
    await handleSubmit(task.sourcePrompt || task.prompt, task.referenceImages);
  };

  // Resume an interrupted pipeline from its breakpoint
  const handleResumePipeline = useCallback(async (task: TaskRecord) => {
    if (isGenerating) return;

    try {
      // Try to load saved pipeline input for true breakpoint resume
      const savedInput = await getPipelineInput(task.id).catch(() => null);

      if (savedInput && savedInput.images?.length) {
        // Have breakpoint data - resume from where it left off
        let resumeOutputs: Record<string, AgentOutput> = {};
        try {
          const organized = await getOrganizedAssets(task.id);
          for (const [agentId, assets] of Object.entries(organized)) {
            if (assets.length > 0 && assets[0].data) {
              resumeOutputs[agentId] = {
                agentId, status: 'success', data: assets[0].data,
                duration: 0, startedAt: 0, completedAt: 0,
              };
            }
          }
        } catch (e) { /* ignore */ }

        setIsGenerating(true);
        setGeneratingTaskId(task.id);
        setPipelineProgress([]);
        setGenerationProgress('恢复断点，继续执行...');

        task.status = 'processing';
        task.canResume = false;
        task.failReason = undefined;
        task.updatedAt = Date.now();
        await saveTask(task);
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t } : t));

        try {
          const pipeline = new FastPipeline((event) => {
            setPipelineProgress(prev => {
              const next = [...prev];
              const existing = next.findIndex(e => e.agentId === event.agentId);
              if (existing >= 0) next[existing] = event;
              else next.push(event);
              savePipelineProgress(task.id, next, { progressText: `${event.agentName}: ${event.status}` });
              return next;
            });
            setGenerationProgress(`${event.agentName}: ${event.status === 'running' ? '执行中...' : event.status === 'success' ? '完成' : event.status === 'failed' ? '失败' : event.message || '等待中'}`);
          });

          const result = await pipeline.run(savedInput, Object.keys(resumeOutputs).length ? resumeOutputs : undefined);
          if (result.finalImages.length === 0) throw new Error('未能生成任何图片');

          const images: GeneratedImage[] = result.finalImages.map(img => ({
            ...img, generationMode: 'strict-composite' as const,
            fidelityStatus: 'preserved' as const,
            fidelityWarnings: result.retries > 0 ? [`经过${result.retries}次重试`] : [],
          }));

          task.status = 'success';
          task.images = images;
          task.fidelityStatus = 'preserved';
          task.updatedAt = Date.now();
          await saveTask(task);
          setTasks(prev => prev.map(t => t.id === task.id ? task : t));
          await clearPipelineInput(task.id);
        } catch (err: any) {
          task.status = 'failure';
          task.failReason = err.message;
          task.updatedAt = Date.now();
          await saveTask(task);
          setTasks(prev => prev.map(t => t.id === task.id ? { ...t } : t));
        } finally {
          setIsGenerating(false);
          setGeneratingTaskId(null);
          setGenerationProgress('');
          setPipelineProgress([]);
          clearPipelineProgress();
        }
      } else {
        // No breakpoint data - fall back to simple retry via handleRetry
        await handleRetry(task);
      }
    } catch (err: any) {
      console.error('[handleResumePipeline] Unexpected error:', err);
      // Last resort: just retry
      await handleRetry(task);
    }
  }, [isGenerating, handleRetry]);

  // Continue generating based on a specific image + user comment
  const handleContinueFromImage = useCallback((task: TaskRecord, imageIndex: number, comment: string) => {
    if (isGenerating) return;
    const img = task.images[imageIndex];
    if (!img) return;

    // Never promote a generated poster to product source. Reuse the original source product only.
    const refImages = task.referenceImages?.length ? task.referenceImages : undefined;
    const originalPrompt = task.sourcePrompt || task.prompt;
    const newPrompt = `${originalPrompt}\n\n修改意见: ${comment}`;

    handleSubmit(newPrompt, refImages);
  }, [isGenerating, handleSubmit]);

  const handleClearAll = async () => {
    if (confirm('确定要清除所有任务吗？此操作不可恢复。')) {
      await clearAllTasks();
      setTasks([]);
    }
  };

  // Filter tasks
  const filteredTasks = tasks.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return t.prompt.toLowerCase().includes(q) ||
        JSON.stringify(t.params).toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <TopNav
        view={view}
        setView={setView}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        vaultReady={vaultReady}
        onInitVault={handleInitVault}
        cacheStats={cacheStats}
      />

      <main className="flex-1 pb-40 px-4 pt-4 max-w-7xl mx-auto w-full">
        {view === 'gallery' && !showFavorites && (
          <Gallery
            tasks={filteredTasks}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            showFavorites={showFavorites}
            setShowFavorites={setShowFavorites}
            onPreview={setPreviewImage}
            onDelete={handleDeleteTask}
            onToggleFavorite={handleToggleFavorite}
            onRetry={handleRetry}
            onResumePipeline={handleResumePipeline}
            onContinueFromImage={handleContinueFromImage}
            isGenerating={isGenerating}
            generatingTaskId={generatingTaskId}
            generationProgress={generationProgress}
            pipelineProgress={pipelineProgress}
          />
        )}

        {view === 'gallery' && showFavorites && (
          <FavoritesView
            tasks={tasks.filter(t => t.favorite)}
            onPreview={setPreviewImage}
            onDelete={handleDeleteTask}
            onToggleFavorite={handleToggleFavorite}
            onBack={() => setShowFavorites(false)}
          />
        )}

        {view === 'canvas' && (
          <div className="h-[calc(100vh-56px)]">
            <InfiniteCanvas
              apiConfig={apiConfig}
              setApiConfig={setApiConfig}
              onImageGenerated={(_nodeId, images, prompt) => {
                // When images are generated in canvas, also save to gallery
                images.forEach(img => {
                  const task = createTaskRecord(prompt || '[画布生成]', params, []);
                  task.status = 'success';
                  task.images = [{ b64_json: img.b64_json, revised_prompt: img.revised_prompt }];
                  saveTask(task);
                  setTasks(prev => [task, ...prev]);
                });
              }}
            />
          </div>
        )}
      </main>

      {view === 'gallery' && (
        <InputBar
          params={params}
          setParams={setParams}
          onSubmit={handleSubmit}
          onOpenSizeDialog={() => setShowSizeDialog(true)}
          isGenerating={isGenerating}
          imageCount={apiConfig.imageCount || 1}
        />
      )}

      {showSizeDialog && (
        <SizeDialog
          sizeConfig={sizeConfig}
          setSizeConfig={setSizeConfig}
          params={params}
          setParams={setParams}
          onClose={() => setShowSizeDialog(false)}
        />
      )}

      {showSettings && (
        <SettingsPanel
          apiConfig={apiConfig}
          setApiConfig={setApiConfig}
          settings={settings}
          setSettings={setSettings}
          onClose={() => setShowSettings(false)}
          onClearAll={handleClearAll}
        />
      )}

      {previewImage && (
        <ImagePreview
          src={previewImage}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}

