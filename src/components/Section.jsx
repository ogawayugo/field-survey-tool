import { memo } from 'react';

export default memo(function Section({ title, children }) {
  return (
    <div className="mb-6">
      <h3 className="serif text-sm font-medium text-stone-700 mb-3 tracking-wide">{title}</h3>
      {children}
    </div>
  );
});
