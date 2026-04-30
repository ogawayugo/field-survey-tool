import { memo } from 'react';

export default memo(function Field({ label, children }) {
  return (
    <div>
      <label className="text-[11px] text-stone-600 block mb-1 tracking-wide">{label}</label>
      {children}
    </div>
  );
});
