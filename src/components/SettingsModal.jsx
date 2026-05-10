import { useState, useEffect } from 'react';

/**
 * 調査基本情報を編集するモーダル（v3.1）
 * 路線名・樹木医名・診断日を一度入力すれば全樹のカルテに反映される。
 */
export default function SettingsModal({ isOpen, surveyMeta, onSave, onClose }) {
  const [route, setRoute] = useState('');
  const [office, setOffice] = useState('');
  const [diagnostician, setDiagnostician] = useState('');
  const [date, setDate] = useState('');

  // モーダルが開くたびに最新の surveyMeta を反映
  useEffect(() => {
    if (isOpen) {
      setRoute(surveyMeta?.route || '');
      setOffice(surveyMeta?.office || '');
      setDiagnostician(surveyMeta?.diagnostician || '');
      setDate(surveyMeta?.date || '');
    }
  }, [isOpen, surveyMeta]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      route: route.trim(),
      office: office.trim(),
      diagnostician: diagnostician.trim(),
      date,
    });
    onClose();
  };

  const handleSetToday = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    setDate(`${yyyy}-${mm}-${dd}`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-xl sm:rounded-xl w-full sm:max-w-md p-4 max-h-[90vh] overflow-y-auto">
        <h2 className="font-bold text-lg mb-2">調査基本情報</h2>
        <p className="text-xs text-gray-500 mb-4">
          ここで入力した内容は、すべての樹のカルテに自動反映されます。
        </p>

        {/* 路線名 */}
        <div className="mb-3">
          <label className="text-sm font-medium text-gray-700 block mb-1">
            路線名
          </label>
          <input
            type="text"
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            placeholder="例：渋谷氷川の杜"
            className="w-full p-2 border rounded text-sm"
          />
        </div>

        {/* 事務所名 */}
        <div className="mb-3">
          <label className="text-sm font-medium text-gray-700 block mb-1">
            事務所名
          </label>
          <input
            type="text"
            value={office}
            onChange={(e) => setOffice(e.target.value)}
            placeholder="例：渋谷営業所"
            className="w-full p-2 border rounded text-sm"
          />
        </div>

        {/* 樹木医名 */}
        <div className="mb-3">
          <label className="text-sm font-medium text-gray-700 block mb-1">
            樹木医名
          </label>
          <input
            type="text"
            value={diagnostician}
            onChange={(e) => setDiagnostician(e.target.value)}
            placeholder="例：小川 ○○"
            className="w-full p-2 border rounded text-sm"
          />
        </div>

        {/* 診断日 */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-700">
              診断日
            </label>
            <button
              type="button"
              onClick={handleSetToday}
              className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
            >
              今日
            </button>
          </div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full p-2 border rounded text-sm"
          />
        </div>

        {/* ボタン */}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 hover:bg-gray-100 rounded"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
