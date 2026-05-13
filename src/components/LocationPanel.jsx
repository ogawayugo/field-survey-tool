import { memo, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, MapPin, Loader2 } from 'lucide-react';

const DEFAULT_LOCATION = { latitude: '', longitude: '' };

function countLocation(loc) {
  if (!loc) return 0;
  let n = 0;
  if (loc.latitude && String(loc.latitude).trim()) n++;
  if (loc.longitude && String(loc.longitude).trim()) n++;
  return n;
}

const LocationPanel = memo(function LocationPanel({ location, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const loc = location ?? DEFAULT_LOCATION;
  const count = countLocation(location);

  const update = useCallback((changes) => {
    onChange({ ...DEFAULT_LOCATION, ...loc, ...changes });
  }, [loc, onChange]);

  const fetchCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      alert('この端末は位置情報に対応していません');
      return;
    }
    setIsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(7);
        const lon = position.coords.longitude.toFixed(7);
        onChange({ ...DEFAULT_LOCATION, ...loc, latitude: lat, longitude: lon });
        setIsLoading(false);
      },
      (error) => {
        console.error(error);
        let msg = '位置情報の取得に失敗しました';
        if (error.code === 1) msg = '位置情報のアクセスが拒否されています。設定で許可してください';
        if (error.code === 2) msg = 'GPS信号が取得できません（屋内/地下など）';
        if (error.code === 3) msg = 'タイムアウトしました';
        alert(msg);
        setIsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [loc, onChange]);

  return (
    <div className="border border-stone-300 rounded">
      <button
        type="button"
        onClick={() => setIsOpen(v => !v)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-stone-50 transition-colors"
      >
        {isOpen
          ? <ChevronDown className="w-4 h-4 text-stone-600" strokeWidth={2} />
          : <ChevronRight className="w-4 h-4 text-stone-600" strokeWidth={2} />}
        <span className="text-sm font-medium text-stone-800">位置座標（WGS84）</span>
        <span className="text-[11px] text-stone-500">({count}/2)</span>
      </button>

      {isOpen && (
        <div className="border-t border-stone-200 p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-stone-600 mb-1">緯度</p>
              <input
                type="text"
                inputMode="decimal"
                value={loc.latitude || ''}
                onChange={(e) => update({ latitude: e.target.value })}
                placeholder="35.6580230"
                className="w-full px-2 py-1.5 border border-stone-300 rounded text-xs focus:outline-none focus:border-emerald-700"
              />
            </div>
            <div>
              <p className="text-[11px] text-stone-600 mb-1">経度</p>
              <input
                type="text"
                inputMode="decimal"
                value={loc.longitude || ''}
                onChange={(e) => update({ longitude: e.target.value })}
                placeholder="139.7016500"
                className="w-full px-2 py-1.5 border border-stone-300 rounded text-xs focus:outline-none focus:border-emerald-700"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={fetchCurrentLocation}
            disabled={isLoading}
            className="w-full py-2 border border-stone-300 bg-white text-sm hover:border-emerald-700 hover:text-emerald-800 flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                取得中...
              </>
            ) : (
              <>
                <MapPin className="w-4 h-4" />
                GPSで現在地を取得
              </>
            )}
          </button>
          <p className="text-[10px] text-stone-500">※取得後も手で修正可能</p>
        </div>
      )}
    </div>
  );
});

export default LocationPanel;
