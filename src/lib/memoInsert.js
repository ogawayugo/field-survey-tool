/**
 * 現場メモに部位診断項目を挿入する。
 *
 * - メモが空、または末尾が改行で終わっている場合
 *   → 新しい行で `部位:項目名` を追加
 * - メモの最終行が同じ部位の続き（先頭が `部位:` で始まっている）
 *   → 既存テキストの末尾に `、項目名` を追加
 * - メモの最終行が違う部位、または部位ラベルを持たない
 *   → 改行 + `部位:項目名` を追加
 */
export function insertDiagnosisItem(currentMemo, part, item) {
  // 末尾の余分な読点・空白を除去（「、 」「 、」「、、」など）
  let memo = (currentMemo || '').replace(/[、\s]+$/, '');

  // メモが完全に空
  if (memo.length === 0) {
    return `${part}:${item}`;
  }

  // 最終行を取得
  const lines = memo.split('\n');
  const lastLine = lines[lines.length - 1];

  // 最終行が空（メモが改行のみで終わっている）
  if (lastLine.trim().length === 0) {
    return memo + `${part}:${item}`;
  }

  // 最終行の先頭が「部位:」または「部位：」で始まっているかチェック
  const partsPattern = /^(根元|幹|大枝)[:：]/;
  const match = lastLine.match(partsPattern);

  if (match) {
    const lastLinePart = match[1];
    if (lastLinePart === part) {
      // 同じ部位 → 読点で続ける
      return memo + `、${item}`;
    } else {
      // 違う部位 → 改行して新しい部位ラベルから
      return memo + `\n${part}:${item}`;
    }
  }

  // 最終行が部位ラベルを持たない → 改行して新しい部位ラベルから
  return memo + `\n${part}:${item}`;
}
