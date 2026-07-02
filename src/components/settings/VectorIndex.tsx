import { useState, useRef, useCallback, useEffect } from 'react';
import SubmitButton from '@/components/SubmitButton';

// ── Types ──────────────────────────────────────────────────────────────────
interface CollectioinStats {
  result: {
    status: 'green' | 'yellow' | 'red' | string;
    optimizer_status: 'ok' | string;
    indexed_vectors_count?: number;
    points_count?: number;
    segments_count?: number;
    config: Record<string, any>;
    payload_schema: Record<string, any>;
    update_queue?: number;
    [key: string]: any;
  };
  status: 'ok' | string;
  time: number;
  [key: string]: any;
}

interface CloudflareIndexStats {
  vectorsCount: number;
  dimensions: number;
  [key: string]: any;
}

interface UploadState {
  idle: 'idle';
  sending: 'sending';
  done: 'done';
  error: 'error';
}
type Phase = UploadState[keyof UploadState];

type IndexProvider = 'qdrant' | 'cloudflare';

// ── API helpers ────────────────────────────────────────────────────────────
async function fetchCollectioinStats(): Promise<CollectioinStats> {
  const res = await fetch('/api/get-qdrant-collection-stats');
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
}

async function sendBatchToQdrant(titles: string[]): Promise<void> {
  const res = await fetch('/api/upsert-collection-points', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titles }),
  });
  if (!res.ok) throw new Error(`Batch failed: ${res.statusText}`);
}

async function sendBatchToCloudflare(titles: string[]): Promise<void> {
  const res = await fetch('/api/upsert-vectors-to-cloudflare-index', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ titles }),
  });
  if (!res.ok) throw new Error(`Batch failed: ${res.statusText}`);
}

const API_BASE_PATH = '/api';

async function fetchQdrantSettints(): Promise<{ qdrantUrl: string }> {
  const res = await fetch(`${API_BASE_PATH}/get-qdrant-settings`);
  if (!res.ok) throw new Error('加载 Vector Index 设置失败');
  const data = await res.json();
  return { qdrantUrl: data?.qdrantUrl ?? '' };
}

interface SaveQdrantCollectionResult {
  status?: string;
}

async function saveAndInitQdrantCollection(
  qdrantUrl: string,
  qdrantApiKey: string
): Promise<SaveQdrantCollectionResult> {
  const res = await fetch(`${API_BASE_PATH}/save-and-init-qdrant-collection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qdrantUrl, qdrantApiKey }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `保存并初始化失败：${res.status}`);
  return data;
}

async function fetchCloudflareIndexStats(): Promise<CloudflareIndexStats> {
  const res = await fetch(`${API_BASE_PATH}/get-cloudflare-vector-index-status`);
  if (!res.ok) throw new Error('Failed to fetch Cloudflare index stats');
  return res.json();
}

async function fetchActiveProvider(): Promise<IndexProvider | null> {
  const res = await fetch(`${API_BASE_PATH}/get-vector-index-provider`);
  if (!res.ok) throw new Error('Failed to fetch active provider');
  const data = await res.json();
  // 后端返回 { vectorIndexProvider: 'qdrant' | 'cloudflare' }
  const p = data?.vectorIndexProvider;
  console.log("fetchActiveProvider, backend returned: ", p)
  if (p === 'qdrant' || p === 'cloudflare') return p;
  await saveIndexProviderSelection('qdrant').catch((e) => console.error('Failed to set default provider:', e)); // 默认设置为 qdrant
  console.log("Defaulting to 'qdrant' provider")
  return 'qdrant'; // default to qdrant if not set or unrecognized
}

async function saveIndexProviderSelection(vectorIndexProvider: IndexProvider): Promise<void> {
  const res = await fetch(`${API_BASE_PATH}/set-vector-index-provider`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vectorIndexProvider }),
  });
  if (!res.ok) throw new Error('Failed to save provider selection');
}

// ── Provider Toggle ────────────────────────────────────────────────────────
function ProviderToggle({
  active,
  onChange,
}: {
  active: IndexProvider;
  onChange: (p: IndexProvider) => void;
}) {
  const [saving, setSaving] = useState(false);
  console.log("ProviderToggle rendered with active provider: ", active) // Debug log to trace active provider

  const handleSelect = async (p: IndexProvider) => {
    if (p === active || saving) return;
    setSaving(true);
    try {
      await saveIndexProviderSelection(p);
      onChange(p);
    } catch (e) {
      console.error('Failed to save provider:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">
            Index Provider
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            选择激活的向量索引后端，另一个将自动停用
          </p>
        </div>
        {saving && (
          <span className="text-xs text-blue-500 dark:text-blue-400 flex items-center gap-1">
            <RefreshIcon spinning />
            保存中…
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Qdrant toggle */}
        <button
          onClick={() => handleSelect('qdrant')}
          disabled={saving}
          className={[
            'relative flex flex-col items-start gap-2 rounded-xl border-2 px-4 py-3.5 transition-all duration-200 text-left',
            active === 'qdrant'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 shadow-md shadow-blue-100 dark:shadow-blue-950/30'
              : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 hover:border-gray-300 dark:hover:border-gray-600',
            saving ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
          ].join(' ')}
        >
          <div className="flex w-full items-center justify-between">
            <span className="flex items-center gap-2">
              <QdrantIcon active={active === 'qdrant'} />
              <span
                className={`text-sm font-semibold ${
                  active === 'qdrant'
                    ? 'text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                Qdrant
              </span>
            </span>
            <span
              className={[
                'text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide transition-all duration-200',
                active === 'qdrant'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500',
              ].join(' ')}
            >
              {active === 'qdrant' ? '● 启用' : '○ 停用'}
            </span>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
            自托管或云端 Qdrant 实例
          </p>
        </button>

        {/* Cloudflare toggle */}
        <button
          onClick={() => handleSelect('cloudflare')}
          disabled={saving}
          className={[
            'relative flex flex-col items-start gap-2 rounded-xl border-2 px-4 py-3.5 transition-all duration-200 text-left',
            active === 'cloudflare'
              ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/40 shadow-md shadow-orange-100 dark:shadow-orange-950/30'
              : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 hover:border-gray-300 dark:hover:border-gray-600',
            saving ? 'cursor-not-allowed opacity-70' : 'cursor-pointer',
          ].join(' ')}
        >
          <div className="flex w-full items-center justify-between">
            <span className="flex items-center gap-2">
              <CloudflareIcon active={active === 'cloudflare'} />
              <span
                className={`text-sm font-semibold ${
                  active === 'cloudflare'
                    ? 'text-orange-600 dark:text-orange-300'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
              >
                Cloudflare
              </span>
            </span>
            <span
              className={[
                'text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide transition-all duration-200',
                active === 'cloudflare'
                  ? 'bg-orange-400 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500',
              ].join(' ')}
            >
              {active === 'cloudflare' ? '● 启用' : '○ 停用'}
            </span>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
            Cloudflare Vectorize 边缘索引
          </p>
        </button>
      </div>
    </div>
  );
}

// ── ProviderSection ────────────────────────────────────────────────────────
function ProviderSection({
  provider,
  children,
}: {
  provider: IndexProvider;
  children: React.ReactNode;
}) {
  const isQdrant = provider === 'qdrant';

  const wrapperClass = isQdrant
    ? 'rounded-xl overflow-hidden border border-blue-200 dark:border-blue-800/60'
    : 'rounded-xl overflow-hidden border border-orange-200 dark:border-orange-800/60';

  const headerClass = isQdrant
    ? 'flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-800/60'
    : 'flex items-center gap-2 px-4 py-2 bg-orange-50 dark:bg-orange-950/40 border-b border-orange-200 dark:border-orange-800/60';

  const dotClass = isQdrant
    ? 'w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400'
    : 'w-1.5 h-1.5 rounded-full bg-orange-400 dark:bg-orange-400';

  const labelClass = isQdrant
    ? 'text-[11px] font-semibold tracking-widest uppercase text-blue-700 dark:text-blue-300'
    : 'text-[11px] font-semibold tracking-widest uppercase text-orange-600 dark:text-orange-300';

  return (
    <div className={wrapperClass}>
      {/* Header bar */}
      <div className={headerClass}>
        <span className={dotClass} />
        {isQdrant ? <QdrantIcon active /> : <CloudflareIcon active />}
        <span className={labelClass}>
          {isQdrant ? 'Qdrant 配置' : 'Cloudflare 配置'}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3 p-3.5 bg-white dark:bg-gray-800/50">
        {children}
      </div>
    </div>
  );
}

// ── Cloudflare Index Stats Card ────────────────────────────────────────────
function CloudflareIndex() {
  const [stats, setStats] = useState<CloudflareIndexStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchCloudflareIndexStats();
      setStats(data);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CloudflareIcon active />
          <h2 className="text-sm font-semibold tracking-widest uppercase text-orange-400 dark:text-orange-500">
            Cloudflare Vector Index
          </h2>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md
            text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200
            hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
        >
          <RefreshIcon spinning={loading} />
          刷新
        </button>
      </div>

      {err ? (
        <p className="text-xs text-red-500">{err}</p>
      ) : (
        <div className="flex gap-8">
          <div>
            <p className="text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {stats ? stats.vectorCount : '—'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">向量数量</p>
          </div>
          <div>
            <p className="text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {stats ? stats.dimensions : '—'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">维度</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── InitQdrantCollection ───────────────────────────────────────────────────
function InitQdrantCollection() {
  const [qdrantUrl, setQdrantUrl] = useState('');
  const [qdrantApiKey, setQdrantApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadSettings() {
      try {
        const settings = await fetchQdrantSettints();
        if (!mounted) return;
        setQdrantUrl(settings.qdrantUrl ?? '');
        setQdrantApiKey('');
      } catch (err: unknown) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : '加载初始化失败');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadSettings();
    return () => {
      mounted = false;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSaveAndInit = useCallback(() => {
    setMessage(null);
    setError(null);
    const urlValue = qdrantUrl.trim();
    const apiKeyValue = qdrantApiKey.trim();
    if (!urlValue) {
      setError('请填写 Qdrant URL');
      return;
    }
    if (!apiKeyValue) {
      setError('请填写 Qdrant API Key');
      return;
    }
    if (!window.confirm('确认保存当前 Qdrant URL 和 API Key 并初始化 Collection 吗？')) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setSending(true);
      setError(null);
      setMessage(null);
      try {
        const result = await saveAndInitQdrantCollection(urlValue, apiKeyValue);
        if (result.status === 'already_exists') {
          setMessage('Qdrant URL 和 API Key 已保存，Collection 已存在，已跳过初始化。');
        } else {
          setMessage('Qdrant URL 和 API Key 已保存，并已开始初始化 Collection。');
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : '保存并初始化失败');
      } finally {
        setSending(false);
        debounceRef.current = null;
      }
    }, 300);
  }, [qdrantUrl, qdrantApiKey]);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">
            Qdrant Settings
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            设置 Qdrant URL 和 API Key，然后保存并初始化集合。
          </p>
        </div>
        {loading && (
          <span className="text-xs text-gray-400 dark:text-gray-500">加载中…</span>
        )}
      </div>

      <div className="grid gap-4">
        <label className="space-y-2 text-sm">
          <span className="text-gray-700 dark:text-gray-300">Qdrant URL</span>
          <input
            value={qdrantUrl}
            onChange={(e) => setQdrantUrl(e.target.value)}
            placeholder="https://your-qdrant-host"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <label className="space-y-2 text-sm">
          <span className="text-gray-700 dark:text-gray-300">Qdrant API Key</span>
          <input
            type="password"
            value={qdrantApiKey}
            onChange={(e) => setQdrantApiKey(e.target.value)}
            placeholder="Enter Qdrant API Key"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">
          {message}
        </div>
      )}

      <SubmitButton
        onClick={handleSaveAndInit}
        disabled={sending || loading}
        label={sending ? '保存并初始化中…' : '保存并初始化 Qdrant'}
        fullWidth
      />
    </div>
  );
}

// ── StatsCard (Qdrant) ─────────────────────────────────────────────────────
function StatsCard() {
  const [stats, setStats] = useState<CollectioinStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await fetchCollectioinStats();
      setStats(data);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useState(() => {
    load();
  });

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">
          Vector Index
        </h2>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md
            text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200
            hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
        >
          <RefreshIcon spinning={loading} />
          刷新
        </button>
      </div>

      {err ? (
        <p className="text-xs text-red-500">{err}</p>
      ) : (
        <div className="flex gap-8">
          <div>
            <p className="text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {stats ? stats.result.points_count : '—'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">向量数量</p>
          </div>
          <div>
            <p className="text-3xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
              {stats ? stats.result.config.params.vectors[''].size : '—'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">维度</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helper to update collection optimizers threshold for Qdrant ── 
// 关闭 Qdrant 的 index 阈值，在 vector 插入完毕后再打开，可以加速 vector 的插入。
async function updateCollectionOptimizersThreshold(indexing_threshold: number) {
  const res = await fetch('/api/update-collection-optimizers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ indexing_threshold }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => null);
    throw new Error(errorData?.error || `更新优化器失败：${res.status}`);
  }
  return res.json();
}

// ── UploadPanel ────────────────────────────────────────────────────────────
function UploadPanel({ provider }: { provider?: IndexProvider }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [titles, setTitles] = useState<string[]>([]);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [sent, setSent] = useState(0);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const abortRef = useRef(false);

  const BATCH = 100;
  const total = titles.length;
  const progress = total > 0 ? Math.round((sent / total) * 100) : 0;

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setParseErr(null);
    setPhase('idle');
    setSent(0);
    setTitles([]);
    setFileName(null);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        if (!Array.isArray(json)) throw new Error('文件必须是 JSON 数组');
        const arr = json.map((v, i) => {
          if (typeof v !== 'string') throw new Error(`第 ${i + 1} 项不是字符串`);
          return v;
        });
        const uniqueArr = Array.from(new Set(arr)).filter((s) => s.trim() !== '');
        setTitles(uniqueArr);
        setFileName(file.name);
      } catch (err: unknown) {
        setParseErr(err instanceof Error ? err.message : '解析失败');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSend = async () => {
    if (!titles.length || phase === 'sending') return;
    // 在真正开始上传前，随机抽取最多 10 个 title 做 vault 存在性检查
    const sampleCount = Math.min(10, titles.length);
    const shuffled = [...titles].sort(() => 0.5 - Math.random());
    const sample = shuffled.slice(0, sampleCount);
    
    try {
      const checkRes = await fetch('api/check-titles-on-github-vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titles: sample }),
      });
      if (!checkRes.ok) {
        const errData = await checkRes.json().catch(() => null);
        throw new Error(errData?.error || `检查标题失败：${checkRes.status}`);
      }
      const data = await checkRes.json();
      const exists = data?.exists;
      // DO 返回 true 表示所有文件存在，否则返回缺失路径数组
      if (exists !== true) {
        const missing = Array.isArray(exists) ? exists : [];
        const msg = missing.length
          ? `检测到示例标题中有 ${missing.length} 项在 Vault 中不存在，已终止上传。示例缺失文件路径（最多显示10条）：\n${missing.slice(0,10).join('\n')}`
          : '检测到标题在 Vault 中不存在，已终止上传。';
        alert(msg);
        return;
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '检查标题失败');
      return;
    }

    abortRef.current = false;
    setPhase('sending');
    setSent(0);
    setErrMsg(null);
    try {
      // Only update collection optimizers threshold for Qdrant provider
      if (provider === 'qdrant') {
        await updateCollectionOptimizersThreshold(0);
      }
      for (let i = 0; i < titles.length; i += BATCH) {
        if (abortRef.current) break;
        const batch = titles.slice(i, i + BATCH);
        if (provider === 'qdrant') {
          await sendBatchToQdrant(batch);
        } else {
          await sendBatchToCloudflare(batch); 
        }
        setSent(Math.min(i + BATCH, titles.length));
      }
      setPhase(abortRef.current ? 'idle' : 'done');
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : '发送失败');
      setPhase('error');
    } finally {
      // Restore threshold only for Qdrant
      if (provider === 'qdrant') {
        try {
          await updateCollectionOptimizersThreshold(10000);
        } catch (optimizerErr: unknown) {
          console.error('恢复 indexing_threshold 失败：', optimizerErr);
        }
      }
    }
  };

  const handleAbort = () => {
    abortRef.current = true;
  };
  const handleReset = () => {
    setTitles([]);
    setFileName(null);
    setPhase('idle');
    setSent(0);
    setErrMsg(null);
    setParseErr(null);
  };

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm flex flex-col gap-4">
      <h2 className="text-sm font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500">
        上传文章标题文件, 往向量数据库添加标题的向量数据
      </h2>

      <div className="flex items-center gap-3">
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={onFileChange} />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg border
            border-gray-300 dark:border-gray-600
            bg-gray-50 dark:bg-gray-700
            text-gray-700 dark:text-gray-200
            hover:bg-gray-100 dark:hover:bg-gray-600
            transition-colors font-medium"
        >
          <FolderIcon />
          选择 JSON 文件
        </button>
        {fileName && (
          <span
            className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]"
            title={fileName}
          >
            {fileName}
          </span>
        )}
      </div>

      {parseErr && (
        <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
          {parseErr}
        </p>
      )}

      {titles.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
            <span>
              共 <span className="font-semibold text-gray-700 dark:text-gray-300">{total}</span> 条
            </span>
            <span className="italic">只读预览</span>
          </div>
          <textarea
            readOnly
            value={titles.join('\n')}
            rows={Math.min(titles.length, 10)}
            className="w-full text-xs font-mono rounded-lg resize-none
              bg-gray-50 dark:bg-gray-900/60
              border border-gray-200 dark:border-gray-700
              text-gray-700 dark:text-gray-300
              p-3 leading-relaxed
              focus:outline-none select-none cursor-default"
          />
        </div>
      )}

      {phase === 'sending' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
            <span>正在发送…</span>
            <span className="tabular-nums">
              {sent} / {total} ({progress} %)
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {phase === 'done' && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 rounded-lg">
          ✓ 全部 {total} 条已成功发送
        </p>
      )}

      {phase === 'error' && errMsg && (
        <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
          ✕ {errMsg}
        </p>
      )}

      {titles.length > 0 && (
        <div className="flex gap-2">
          {phase !== 'sending' ? (
            <>
              <button
                onClick={handleSend}
                disabled={phase === 'done'}
                className="flex-1 flex items-center justify-center gap-2 text-sm px-4 py-2 rounded-lg font-medium
                  bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                  text-white transition-colors
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <SendIcon />
                {phase === 'done' ? '已发送' : '开始发送'}
              </button>
              {(phase === 'done' || phase === 'error') && (
                <button
                  onClick={handleReset}
                  className="text-sm px-4 py-2 rounded-lg border
                    border-gray-300 dark:border-gray-600
                    text-gray-600 dark:text-gray-300
                    hover:bg-gray-100 dark:hover:bg-gray-700
                    transition-colors font-medium"
                >
                  重置
                </button>
              )}
            </>
          ) : (
            <button
              onClick={handleAbort}
              className="flex-1 text-sm px-4 py-2 rounded-lg font-medium
                border border-amber-400 dark:border-amber-500
                text-amber-600 dark:text-amber-400
                hover:bg-amber-50 dark:hover:bg-amber-900/20
                transition-colors"
            >
              中止
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────
function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 ${spinning ? 'animate-spin' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function QdrantIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="8" height="8" rx="1.5" fill={active ? '#3b82f6' : '#9ca3af'} />
      <rect x="13" y="3" width="8" height="8" rx="1.5" fill={active ? '#93c5fd' : '#d1d5db'} />
      <rect x="3" y="13" width="8" height="8" rx="1.5" fill={active ? '#93c5fd' : '#d1d5db'} />
      <rect x="13" y="13" width="8" height="8" rx="1.5" fill={active ? '#3b82f6' : '#9ca3af'} />
    </svg>
  );
}

function CloudflareIcon({ active }: { active: boolean }) {
  return (
    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
      <path
        d="M17.5 14.5c.28-1.03-.06-2.1-.86-2.77a2.5 2.5 0 0 0-2.64-.42c-.29-1.58-1.68-2.81-3.38-2.81-1.93 0-3.5 1.57-3.5 3.5 0 .07 0 .14.01.21A2.5 2.5 0 0 0 5 14.5c0 1.38 1.12 2.5 2.5 2.5h9.5a2 2 0 0 0 .5-3.5z"
        fill={active ? '#f97316' : '#9ca3af'}
      />
    </svg>
  );
}

// ── Root export ────────────────────────────────────────────────────────────
export default function VectorIndexSettings() {
  const [activeProvider, setActiveProvider] = useState<IndexProvider | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    fetchActiveProvider()
      .then(setActiveProvider)
      .catch((e) => {
        setInitError(e instanceof Error ? e.message : '加载配置失败');
      });
  }, []);

  console.log('Active provider:', activeProvider, 'Init error:', initError);

  // ── 初始加载态 ──
  if (activeProvider === null && !initError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 flex flex-col items-center gap-3 text-gray-400 dark:text-gray-500">
        <RefreshIcon spinning />
        <span className="text-sm">正在加载 Vector Index 配置…</span>
      </div>
    );
  }

  // ── 错误态：不降级，直接展示错误 ──
  if (initError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10 flex flex-col items-center gap-4">
        <div className="rounded-xl border border-red-200 dark:border-red-800/60 bg-red-50 dark:bg-red-900/20 px-6 py-5 flex flex-col items-center gap-3 text-center w-full">
          <svg className="w-8 h-8 text-red-400 dark:text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">加载配置失败</p>
          <p className="text-xs text-red-500 dark:text-red-400">{initError}</p>
          <button
            onClick={() => {
              setInitError(null);
              fetchActiveProvider().then(setActiveProvider).catch((e) => {
                setInitError(e instanceof Error ? e.message : '加载配置失败');
              });
            }}
            className="mt-1 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
              border border-red-300 dark:border-red-700
              text-red-600 dark:text-red-400
              hover:bg-red-100 dark:hover:bg-red-900/40
              transition-colors font-medium"
          >
            <RefreshIcon spinning={false} />
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-2 flex flex-col gap-5">
      <ProviderToggle active={activeProvider!} onChange={setActiveProvider} />

      {activeProvider === 'qdrant' && (
        <ProviderSection provider="qdrant">
          <InitQdrantCollection />
          <StatsCard />
          <UploadPanel provider="qdrant" />
        </ProviderSection>
      )}

      {activeProvider === 'cloudflare' && (
        <ProviderSection provider="cloudflare">
          <CloudflareIndex />
          <UploadPanel provider="cloudflare" />
        </ProviderSection>
      )}
    </div>
  );
}