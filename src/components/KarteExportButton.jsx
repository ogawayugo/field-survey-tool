// src/components/KarteExportButton.jsx
import { useState } from 'react';
import { TreeDeciduous, Loader2, Check, AlertTriangle } from 'lucide-react';
import { initKarteGenerator, generateKarte, downloadBlob, isReady } from '../lib/karteGenerator';

/**
 * Excel カルテ出力ボタン（Pyodide 経由）
 *
 * Props:
 *   getTrees: () => Promise<array>  画像込みの trees 配列を返す関数（重い処理のため lazy）
 *   surveyMeta: { route, diagnostician, date }
 *   disabled: ボタン無効化フラグ
 *   onDone: 成功後コールバック（モーダルを閉じる等）
 */
export default function KarteExportButton({ getTrees, surveyMeta, disabled, onDone }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'generating' | 'done' | 'error'
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(null);

  const handleClick = async () => {
    if (disabled || status === 'loading' || status === 'generating') return;
    setStatus('loading');
    setError(null);
    try {
      // 初回のみ Pyodide ロード（2回目以降は瞬時に通過）
      if (!isReady()) {
        await initKarteGenerator((step, elapsed) => {
          const labels = {
            runtime: 'Python ランタイムを準備中...',
            packages: 'ライブラリをインストール中...',
            assets: 'テンプレートを配置中...',
            import: 'スクリプトを読み込み中...',
            ready: '準備完了',
          };
          setProgress(`${labels[step] || step} (${elapsed.toFixed(1)}秒)`);
        });
      }

      setStatus('generating');
      setProgress('樹データを準備中...');
      const trees = await getTrees();

      if (!trees || trees.length === 0) {
        throw new Error('カルテ対象の樹データがありません');
      }

      setProgress('Excel を生成中...');
      const blob = await generateKarte(trees, surveyMeta);

      const today = new Date().toISOString().slice(0, 10);
      const filename = trees.length === 1
        ? `karte${trees[0].treeNumber ? `_${trees[0].treeNumber}` : ''}${trees[0].species ? `_${trees[0].species}` : ''}_${today}.xlsx`
        : `karte_${trees.length}本_${today}.xlsx`;
      downloadBlob(blob, filename);

      setStatus('done');
      setProgress('完了');
      if (onDone) onDone();
      setTimeout(() => {
        setStatus('idle');
        setProgress('');
      }, 2000);
    } catch (e) {
      console.error('カルテ生成エラー:', e);
      setError(e.message || String(e));
      setStatus('error');
    }
  };

  const isBusy = status === 'loading' || status === 'generating';
  const isDisabled = disabled || isBusy;

  const renderIcon = () => {
    if (status === 'done') return <Check className="w-5 h-5 text-emerald-900 flex-shrink-0 mt-0.5" />;
    if (status === 'error') return <AlertTriangle className="w-5 h-5 text-red-700 flex-shrink-0 mt-0.5" />;
    if (isBusy) return <Loader2 className="w-5 h-5 text-emerald-900 flex-shrink-0 mt-0.5 animate-spin" />;
    return <TreeDeciduous className="w-5 h-5 text-emerald-900 flex-shrink-0 mt-0.5" />;
  };

  const renderTitle = () => {
    if (status === 'loading') return '初期化中...';
    if (status === 'generating') return '生成中...';
    if (status === 'done') return 'ダウンロード完了';
    if (status === 'error') return 'エラー（クリックで再試行）';
    return 'カルテ Excel（完成形 / Pyodide）';
  };

  const renderDescription = () => {
    if (status === 'error' && error) return `エラー: ${error}`;
    if (isBusy && progress) return progress;
    if (status === 'done') return 'ブラウザのダウンロードフォルダを確認してください';
    return 'PC 版 generate.py と同一ロジックでブラウザ内生成。初回のみ Pyodide ロードに 8〜12 秒。';
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      className={`w-full p-4 border transition-colors text-left flex items-start gap-3 ${
        status === 'error'
          ? 'border-red-300 bg-red-50 hover:border-red-500'
          : status === 'done'
          ? 'border-emerald-500 bg-emerald-50'
          : 'border-stone-300 hover:border-emerald-700 hover:bg-emerald-50'
      } ${isDisabled ? 'cursor-not-allowed opacity-90' : 'cursor-pointer'}`}
    >
      {renderIcon()}
      <div className="flex-1">
        <div className="font-medium text-sm">{renderTitle()}</div>
        <div className="text-[11px] text-stone-500 mt-0.5">{renderDescription()}</div>
      </div>
    </button>
  );
}
