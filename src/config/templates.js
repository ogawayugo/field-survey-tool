// テンプレート定義
// 将来、別の様式を追加する場合はこのリストに追加するだけで対応可能

export const TEMPLATES = {
  shibuya: {
    id: 'shibuya',
    name: '街路樹診断カルテ（渋谷氷川の杜様式）',
    file: '/templates/shibuya.xlsx',
    sheetName: '街路樹診断カルテ様式',

    // 基本情報マッピング（PWAキー → セル番地）
    basicInfo: {
      treeNumber: 'G4',
      species: 'E5',
      height: 'Y4',
      girth: 'AF4',
      spread: 'AN4',
      route: 'G3',
      diagnostician: 'X3',
      date: 'AL3',
    },

    // セル内チェックボックス（複数選択肢から1つを ■ にする）
    // セル内の文字列の中の `□XXX` を `■XXX` に置換する
    cellCheckboxes: {
      plantingForm: { cell: 'Q5', options: ['単独桝', '植栽帯', '緑地内', 'その他'] },
      stake: { cell: 'AK5', options: ['良好', 'なし', '破損'] },
      vitalitySei: { cell: 'AF7', options: ['１', '２', '３', '４', '５'] },
      vitalityKei: { cell: 'AF8', options: ['１', '２', '３', '４', '５'] },
      vitalityJudgment: { cell: 'H11', options: ['健全か健全に近い', '注意すべき被害が見られる', '著しい被害が見られる', '不健全'] },
      appearanceJudgment: { cell: 'G46', options: ['Ａ', 'Ｂ１', 'Ｂ２', 'Ｃ'] },
    },

    // 部位判定マトリクス
    // 行=判定、列=部位
    partJudgmentCells: {
      根元: { A: 'P40', B1: 'P41', B2: 'P42', C: 'P43' },
      幹:   { A: 'Z40', B1: 'Z41', B2: 'Z42', C: 'Z43' },
      大枝: { A: 'AJ40', B1: 'AJ41', B2: 'AJ42', C: 'AJ43' },
    },

    // 診断項目チェックボックス（行13〜28）
    // format: 'ratio' = □なし □1/3未満 □1/3以上, 'arinashi' = □なし□あり（, 'mienai' = □見える□見えない（
    diagnosticCells: {
      樹皮枯死欠損腐朽:   { format: 'ratio',    search: '樹皮枯死', 根元: 'M13', 幹: 'X13', 大枝: 'AI13' },
      開口空洞_芯なし:     { format: 'ratio',    search: '開口空洞（芯に達しない）', 根元: 'M14', 幹: 'X14', 大枝: 'AI14' },
      開口空洞_芯あり:     { format: 'ratio',    search: '開口空洞（芯に達する）', 根元: 'M15', 幹: 'X15', 大枝: 'AI15' },
      枯枝:               { format: 'arinashi', search: '枯枝', 大枝: 'AI16' },
      スタブカット:        { format: 'arinashi', search: 'スタブカット', 大枝: 'AI17' },
      キノコ:             { format: 'arinashi', search: 'キノコ', 根元: 'M18', 幹: 'X18', 大枝: 'AI18' },
      木槌打診:           { format: 'arinashi', search: '木槌打診', 根元: 'M19', 幹: 'X19', 大枝: 'AI19' },
      分岐部付根の異常:    { format: 'arinashi', search: '分岐部', 根元: 'M20', 幹: 'X20', 大枝: 'AI20' },
      胴枯れ病害:         { format: 'arinashi', search: '胴枯れ', 根元: 'M21', 幹: 'X21', 大枝: 'AI21' },
      虫穴虫フン:         { format: 'arinashi', search: '虫穴', 根元: 'M22', 幹: 'X22', 大枝: 'AI22' },
      根元の揺らぎ:       { format: 'arinashi', search: '揺らぎ', 根元: 'M23' },
      鋼棒貫入異常:       { format: 'arinashi', search: '鋼棒貫入', 根元: 'M24' },
      巻き根:             { format: 'arinashi', search: '巻き根', 根元: 'M25' },
      ルートカラー見えない: { format: 'mienai',   search: 'ルートカラー見えない', 根元: 'M26' },
      露出根被害:         { format: 'arinashi', search: '露出根', 根元: 'M27' },
      不自然な傾斜:       { format: 'arinashi', search: '不自然な傾斜', 根元: 'M28' },
    },

    // 所見欄（G29:AS38 が1つの結合セル。マスターは G29）
    shoken: {
      cell: 'G29',
    },

    // 判定理由
    judgmentReason: {
      cell: 'F48',
    },

    // 特記事項
    specialNotes: {
      cell: 'AW56',
    },

    // 写真の配置
    // 樹木全体 = 上枠1つ、クローズアップ = 下3枠
    photoSlots: {
      樹木全体: {
        anchorCell: 'BM13',
        offsetX: 0, offsetY: 0,
        width: 348, height: 358,
        keepAspectRatio: true,
      },
      'クローズアップ1': {
        anchorCell: 'AW37',
        offsetX: 29, offsetY: 18.25,
        width: 167, height: 222.67,
        keepAspectRatio: false,
      },
      'クローズアップ2': {
        anchorCell: 'BK37',
        offsetX: 29, offsetY: 18.25,
        width: 167, height: 222.67,
        keepAspectRatio: false,
      },
      'クローズアップ3': {
        anchorCell: 'BY37',
        offsetX: 29, offsetY: 18.25,
        width: 167, height: 222.67,
        keepAspectRatio: false,
      },
    },
  },
};

// デフォルトテンプレートID
export const DEFAULT_TEMPLATE_ID = 'shibuya';
