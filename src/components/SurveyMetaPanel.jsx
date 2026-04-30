import { memo } from 'react';
import Field from './Field';

export default memo(function SurveyMetaPanel({ surveyMeta, onUpdate }) {
  return (
    <div className="border-t border-stone-300" style={{ background: '#f4ede0' }}>
      <div className="max-w-4xl mx-auto px-4 py-4">
        <p className="text-[10px] text-stone-500 mb-3 tracking-widest uppercase">調査全体の情報（共通）</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="路線名・住所">
            <input type="text" value={surveyMeta.route} onChange={e => onUpdate({ ...surveyMeta, route: e.target.value })}
              className="w-full px-2 py-1.5 border border-stone-300 text-sm focus:outline-none focus:border-emerald-700" />
          </Field>
          <Field label="事務所名">
            <input type="text" value={surveyMeta.office} onChange={e => onUpdate({ ...surveyMeta, office: e.target.value })}
              className="w-full px-2 py-1.5 border border-stone-300 text-sm focus:outline-none focus:border-emerald-700" />
          </Field>
          <Field label="診断日">
            <input type="date" value={surveyMeta.date} onChange={e => onUpdate({ ...surveyMeta, date: e.target.value })}
              className="w-full px-2 py-1.5 border border-stone-300 text-sm focus:outline-none focus:border-emerald-700" />
          </Field>
          <Field label="樹木医">
            <input type="text" value={surveyMeta.diagnostician} onChange={e => onUpdate({ ...surveyMeta, diagnostician: e.target.value })}
              className="w-full px-2 py-1.5 border border-stone-300 text-sm focus:outline-none focus:border-emerald-700" />
          </Field>
        </div>
      </div>
    </div>
  );
});
