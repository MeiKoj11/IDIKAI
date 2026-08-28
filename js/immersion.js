/*
  immersion.js
  ------------
  A single global toggle (the small 🌐 icon in the topbar) that swaps
  the app's shared navigation chrome — the hamburger menu, notifications
  panel, to-do widget, and the "open another section" tab picker — into
  whatever language the current page is in. Page content itself (your
  own vocab, notes, journal entries) is never touched — only the app's
  own UI text around it.

  Deliberately a hand-written dictionary (IMMERSION_STRINGS below)
  rather than a live translation call: this is a small, fixed set of
  strings that barely ever changes, so translating it once up front
  costs nothing and adds no delay, versus re-translating the same
  handful of button labels on every single page load forever.

  Highlighting any translated text (mouse-drag select, or tap-and-hold
  on mobile) shows a small popup with the English original, via the
  same AI dictionary lookup Reading's word-click already uses — so if
  an unfamiliar word or phrase shows up in the navigation, you're never
  stuck without a way to understand it.

  Purely a per-device UI preference (like the reading split-panel
  width) — stored in plain localStorage, not synced to the account,
  since which language you like your own buttons in isn't really
  "data" the way your notes and vocab are.
*/

const IMMERSION_ENABLED_KEY = "immersion.enabled";

// Every string is written from the learner's-eye view — natural
// phrasing in each language rather than a stiff word-for-word gloss,
// same spirit as everything else hand-written in this app.
const IMMERSION_STRINGS = {
  changeLanguageHeading: { es: "Cambiar idioma", ja: "言語を変更", fr: "Changer de langue" },
  langNameEs: { es: "Español", ja: "スペイン語", fr: "Espagnol" },
  langNameJa: { es: "Japonés", ja: "日本語", fr: "Japonais" },
  langNameFr: { es: "Francés", ja: "フランス語", fr: "Français" },
  notificationsHeading: { es: "Notificaciones", ja: "通知", fr: "Notifications" },
  notificationsEmpty: {
    es: "Próximamente — en cuanto exista una conexión con tu profesor, las novedades aparecerán aquí.",
    ja: "近日公開 — 先生とのつながりができたら、ここに更新情報が表示されます。",
    fr: "Bientôt disponible — une fois qu'une connexion avec un professeur existera, les mises à jour apparaîtront ici.",
  },
  todoTitle: { es: "Lista de tareas", ja: "タスクリスト", fr: "Liste de tâches" },
  todoAddPlaceholder: { es: "Añadir una tarea…", ja: "タスクを追加…", fr: "Ajouter une tâche…" },
  todoAddButton: { es: "Añadir", ja: "追加", fr: "Ajouter" },
  todoNoFolder: { es: "Sin carpeta", ja: "フォルダなし", fr: "Aucun dossier" },
  todoShowCompleted: { es: "Mostrar completadas", ja: "完了済みを表示", fr: "Afficher terminées" },
  logOut: { es: "Cerrar sesión", ja: "ログアウト", fr: "Se déconnecter" },
  downloadMyDataOption: { es: "Descargar mis datos", ja: "自分のデータをダウンロード", fr: "Télécharger mes données" },
  tabPickerSectionPlaceholder: { es: "¿Qué sección?", ja: "どのセクション？", fr: "Quelle section ?" },
  tabPickerUnitPlaceholder: { es: "¿Cuál?", ja: "どれ？", fr: "Lequel ?" },
  tabPickerOpen: { es: "Abrir", ja: "開く", fr: "Ouvrir" },
  tabPickerCancel: { es: "Cancelar", ja: "キャンセル", fr: "Annuler" },
  sectionVocab: { es: "Banco de vocabulario", ja: "単語帳", fr: "Banque de vocabulaire" },
  sectionGrammar: { es: "Gramática", ja: "文法", fr: "Grammaire" },
  sectionWriting: { es: "Escritura", ja: "ライティング", fr: "Écriture" },
  sectionSpeaking: { es: "Habla", ja: "スピーキング", fr: "Expression orale" },
  sectionReading: { es: "Lectura", ja: "リーディング", fr: "Lecture" },
  sectionPersonalHub: { es: "Espacio personal", ja: "パーソナルハブ", fr: "Espace personnel" },
  sectionListening: { es: "Escucha", ja: "リスニング", fr: "Écoute" },
  allLanguagesLink: { es: "Todos los idiomas", ja: "すべての言語", fr: "Toutes les langues" },

  // ---- Generic, reused across many pages ----
  backPlain: { es: "← Volver", ja: "← 戻る", fr: "← Retour" },
  backToThemes: { es: "← Volver a los temas", ja: "← テーマに戻る", fr: "← Retour aux thèmes" },
  backToGrammar: { es: "← Volver a Gramática", ja: "← 文法に戻る", fr: "← Retour à Grammaire" },
  backToFolder: { es: "← Volver a la carpeta", ja: "← フォルダに戻る", fr: "← Retour au dossier" },
  backToPassages: { es: "← Volver a los textos", ja: "← 文章に戻る", fr: "← Retour aux textes" },
  btnAdd: { es: "Añadir", ja: "追加", fr: "Ajouter" },
  btnCancel: { es: "Cancelar", ja: "キャンセル", fr: "Annuler" },
  btnSave: { es: "Guardar", ja: "保存", fr: "Enregistrer" },
  btnDelete: { es: "Eliminar", ja: "削除", fr: "Supprimer" },
  btnEdit: { es: "Editar", ja: "編集", fr: "Modifier" },
  btnClose: { es: "Cerrar", ja: "閉じる", fr: "Fermer" },
  titleLabel: { es: "Título", ja: "タイトル", fr: "Titre" },
  notesLabel: { es: "Notas", ja: "メモ", fr: "Notes" },
  writeAnythingPlaceholder: { es: "Escribe lo que quieras...", ja: "何でも書いてください…", fr: "Écrivez ce que vous voulez..." },
  nothingHereYet: { es: "Todavía no hay nada aquí.", ja: "まだ何もありません。", fr: "Rien ici pour l'instant." },
  renameButton: { es: "Renombrar", ja: "名前を変更", fr: "Renommer" },
  newFolderOption: { es: "+ Nueva carpeta…", ja: "+ 新しいフォルダ…", fr: "+ Nouveau dossier…" },
  createNewThemeOption: { es: "+ Crear nuevo tema…", ja: "+ 新しいテーマを作成…", fr: "+ Créer un nouveau thème…" },
  lookingUpStatus: { es: "Buscando…", ja: "検索中…", fr: "Recherche en cours…" },
  noTranslationFoundHint: { es: "No se encontró traducción — igual puedes añadirla manualmente desde el Banco de Vocabulario.", ja: "翻訳が見つかりませんでした — 単語帳から手動で追加することもできます。", fr: "Aucune traduction trouvée — tu peux quand même l'ajouter manuellement depuis la Banque de vocabulaire." },
  grammarLookupFailedHint: { es: "No se pudo buscar esto automáticamente — igual puedes guardarlo y escribir tus propias notas.", ja: "自動で調べられませんでした — 保存して自分でメモを書くこともできます。", fr: "Impossible de rechercher cela automatiquement — tu peux quand même l'enregistrer et écrire tes propres notes." },

  // ---- Personal Hub ----
  helperNotebookHeading: { es: "Cuaderno de ayuda", ja: "ヘルパーノート", fr: "Cahier d'aide" },
  hubLateLabel: { es: "Atrasado", ja: "遅れ", fr: "En retard" },
  hubLatePlaceholder: { es: "p. ej. Lectura del capítulo 4", ja: "例：第4章の読解", fr: "p. ex. Lecture du chapitre 4" },
  hubHomeworkLabel: { es: "Tarea", ja: "宿題", fr: "Devoirs" },
  hubHomeworkPlaceholder: { es: "p. ej. Hoja de ejercicios 3", ja: "例：ワークシート3", fr: "p. ex. Feuille d'exercices 3" },
  notesToSelfLabel: { es: "Notas para ti mismo/a", ja: "自分へのメモ", fr: "Notes pour toi-même" },
  notesToSelfPlaceholder: { es: "Cualquier cosa para tu yo futuro…", ja: "未来の自分へ、何でも…", fr: "N'importe quoi pour ton futur toi…" },
  notesToTeacherLabel: { es: "Notas para el profesor", ja: "先生へのメモ", fr: "Notes pour le professeur" },
  notesToTeacherPlaceholder: { es: "Preguntas o notas para un profesor (una vez conectado)…", ja: "先生への質問やメモ（つながったら）…", fr: "Questions ou notes pour un professeur (une fois connecté)…" },
  yourBubblesHeading: { es: "Tus burbujas", ja: "あなたのバブル", fr: "Tes bulles" },
  personalHubIntro: {
    es: "Un espacio libre para cualquier cosa que no encaje en otro sitio — una lista de tareas, una idea al azar, lo que sea. Crea tantas burbujas como quieras.",
    ja: "他のどこにも当てはまらないもののための自由なスペース — 買い物リスト、ふとしたアイデア、何でも。好きなだけバブルを作ってください。",
    fr: "Un espace libre pour tout ce qui ne rentre nulle part ailleurs — une liste de tâches, une idée random, n'importe quoi. Crée autant de bulles que tu veux.",
  },
  addBubbleButton: { es: "+ Añadir burbuja", ja: "+ バブルを追加", fr: "+ Ajouter une bulle" },
  personalNoteTitlePlaceholder: { es: "p. ej. Lista de tareas", ja: "例：やることリスト", fr: "p. ex. Liste de tâches" },

  // ---- Language home bubble descriptions ----
  subVocab: { es: "Temas, palabras, conjugación de verbos, tarjetas", ja: "テーマ、単語、動詞の活用、単語カード", fr: "Thèmes, mots, conjugaison, cartes mémo" },
  subGrammar: { es: "Tus propias notas sobre estructuras y patrones", ja: "文の構造やパターンに関する自分のメモ", fr: "Tes propres notes sur les structures et les tournures" },
  subWriting: { es: "Entradas tipo diario con fecha, vinculadas a un texto de referencia", ja: "日付付きの日記形式のエントリー、参照用の文章にリンク", fr: "Entrées façon journal datées, liées à un texte de référence" },
  subPersonalHub: { es: "Tu propio espacio — notas, listas de tareas, lo que sea", ja: "あなた自身のスペース — メモ、やることリスト、何でも", fr: "Ton propre espace — notes, listes de tâches, n'importe quoi" },
  subReading: { es: "Textos con búsqueda de palabras al hacer clic", ja: "クリックで単語を調べられる文章", fr: "Textes avec recherche de mots en un clic" },
  subSpeaking: { es: "Grábate hablando, vinculado a un texto para leer en voz alta", ja: "音読するための文章にリンクした自分の発話の録音", fr: "Enregistre-toi en train de parler, lié à un texte à lire à voix haute" },
  comingSoon: { es: "Próximamente", ja: "近日公開", fr: "Bientôt disponible" },
  comingSoonForLanguage: { es: "Próximamente para este idioma", ja: "この言語では近日公開", fr: "Bientôt disponible pour cette langue" },

  // ---- Vocab Bank ----
  themesHeading: { es: "Temas", ja: "テーマ", fr: "Thèmes" },
  themesHint: {
    es: "Los temas son tus carpetas — p. ej. \"Escuela\", \"Verbos\", \"Comida\". Haz clic en un tema para abrirlo.",
    ja: "テーマはあなたのフォルダです — 例：「学校」「動詞」「食べ物」。テーマをクリックして開いてください。",
    fr: "Les thèmes sont tes dossiers — p. ex. « École », « Verbes », « Nourriture ». Clique sur un thème pour l'ouvrir.",
  },
  themeNamePlaceholder: { es: "Nombre del tema", ja: "テーマ名", fr: "Nom du thème" },
  addThemeButton: { es: "Añadir tema", ja: "テーマを追加", fr: "Ajouter un thème" },
  addNewVocabTitle: { es: "Añadir vocabulario nuevo", ja: "新しい単語を追加", fr: "Ajouter du vocabulaire" },
  addNewVocabSub: { es: "Añade palabras y ve todo lo guardado en este tema", ja: "単語を追加し、このテーマに保存されたものをすべて見る", fr: "Ajoute des mots et vois tout ce qui est enregistré dans ce thème" },
  testTitle: { es: "Prueba", ja: "テスト", fr: "Test" },
  testSub: { es: "Prueba de tarjetas o práctica de conjugación verbal", ja: "単語カードクイズまたは動詞活用の練習", fr: "Quiz de cartes mémo ou pratique de conjugaison" },
  addNewVocabHeading: { es: "Añadir vocabulario nuevo", ja: "新しい単語を追加", fr: "Ajouter du vocabulaire" },
  addWordHeadingPrefix: { es: "Añadir una palabra —", ja: "単語を追加 —", fr: "Ajouter un mot —" },
  englishLabel: { es: "Inglés", ja: "英語", fr: "Anglais" },
  targetLanguageLabel: { es: "Idioma objetivo (", ja: "対象言語（", fr: "Langue cible (" },
  furiganaOptionalLabel: { es: "Furigana (opcional)", ja: "ふりがな（任意）", fr: "Furigana (facultatif)" },
  exampleSentenceOptionalLabel: { es: "Frase de ejemplo (opcional)", ja: "例文（任意）", fr: "Phrase d'exemple (facultatif)" },
  addWordHint: {
    es: "Rellena solo un lado y deja el otro en blanco — la app intentará completarlo por ti (una búsqueda rápida en línea, o detección de formas verbales para español), y te dejará revisarlo antes de guardar. Necesita conexión a internet para autocompletar; siempre puedes escribir ambos lados tú mismo/a.",
    ja: "片方だけ入力してもう片方を空欄にしておくと、アプリが自動で補完しようとします（簡単なオンライン検索、またはスペイン語の動詞活用の検出）。保存前に確認できます。自動補完にはインターネット接続が必要です。もちろん両方を自分で入力することもできます。",
    fr: "Remplis un seul côté et laisse l'autre vide — l'appli essaiera de le compléter pour toi (une recherche rapide en ligne, ou une détection de forme verbale pour l'espagnol), et te laissera vérifier avant d'enregistrer. Une connexion internet est nécessaire pour l'auto-complétion ; tu peux toujours remplir les deux côtés toi-même.",
  },
  addWordButton: { es: "Añadir palabra", ja: "単語を追加", fr: "Ajouter le mot" },
  justUseTranslationButton: { es: "Usar solo esta traducción", ja: "この訳だけを使う", fr: "Utiliser juste cette traduction" },
  buildConjugationTableSummary: { es: "O crea una tabla de conjugación para este verbo", ja: "またはこの動詞の活用表を作成する", fr: "Ou crée un tableau de conjugaison pour ce verbe" },
  tensesLabel: { es: "Tiempos verbales", ja: "時制", fr: "Temps" },
  personsLabel: { es: "Personas", ja: "人称", fr: "Personnes" },
  generateTableButton: { es: "Generar tabla y guardar", ja: "表を作成して保存", fr: "Générer le tableau et enregistrer" },
  importVocabListHeading: { es: "Importar una lista de vocabulario", ja: "単語リストをインポート", fr: "Importer une liste de vocabulaire" },
  importVocabListHint: {
    es: "Pega una lista de palabras/frases — tuyas, o copiadas de un libro de texto, una hoja de ejercicios o una web. No hace falta que esté ordenada, solo que se reconozca como una lista de vocabulario — la app identificará qué lado es inglés y sacará pares limpios para que los revises antes de guardar nada.",
    ja: "単語やフレーズのリストを貼り付けてください — 自分のものでも、教科書やワークシート、ウェブサイトからコピーしたものでも構いません。きれいに整っている必要はなく、単語リストだと認識できれば大丈夫です。どちらが英語かを判断し、保存前に確認できるきれいなペアを取り出します。",
    fr: "Colle une liste de mots/phrases — les tiennes, ou copiées d'un manuel, d'une feuille d'exercices ou d'un site web. Pas besoin que ce soit bien rangé, juste reconnaissable comme une liste de vocabulaire — l'appli déterminera quel côté est en anglais et en extraira des paires propres à vérifier avant tout enregistrement.",
  },
  pasteVocabListPlaceholder: { es: "Pega aquí tu lista de vocabulario...", ja: "ここに単語リストを貼り付けてください…", fr: "Colle ta liste de vocabulaire ici..." },
  extractFlashcardsButton: { es: "Extraer tarjetas", ja: "単語カードを抽出", fr: "Extraire les cartes mémo" },
  selectAllButton: { es: "Seleccionar todo", ja: "すべて選択", fr: "Tout sélectionner" },
  selectNoneButton: { es: "No seleccionar nada", ja: "選択解除", fr: "Ne rien sélectionner" },
  saveSelectedButton: { es: "Guardar seleccionados", ja: "選択したものを保存", fr: "Enregistrer la sélection" },
  discardButton: { es: "Descartar", ja: "破棄", fr: "Ignorer" },
  wordsHeadingPrefix: { es: "Palabras —", ja: "単語 —", fr: "Mots —" },
  conjugationTablesHeading: { es: "Tablas de conjugación", ja: "活用表", fr: "Tableaux de conjugaison" },
  conjugationTablesHint: {
    es: "Una tabla combinada por verbo — las tarjetas enlazan aquí en lugar de mostrar la tabla completa dentro.",
    ja: "動詞ごとに1つの統合表 — 単語カードは表全体をインラインで表示する代わりにここにリンクします。",
    fr: "Un tableau fusionné par verbe — les cartes mémo renvoient ici plutôt que d'afficher le tableau complet en ligne.",
  },

  // ---- Grammar folder / notes ----
  addNoteTitle: { es: "+ Añadir nota", ja: "+ メモを追加", fr: "+ Ajouter une note" },
  addNoteSub: { es: "Anota una estructura de frase que notaste", ja: "気づいた文の構造を書き留める", fr: "Note une structure de phrase que tu as remarquée" },
  allSpanishTensesTitle: { es: "Todos los tiempos verbales en español", ja: "スペイン語の全時制", fr: "Tous les temps espagnols" },
  allFrenchTensesTitle: { es: "Todos los tiempos verbales en francés", ja: "フランス語の全時制", fr: "Tous les temps français" },
  tensesOverviewSub: { es: "Vista completa de tiempos verbales + modo de prueba mixto", ja: "時制の全体像＋ミックス時制テストモード", fr: "Vue d'ensemble des temps + un mode test mixte" },
  practiceThisPointTitle: { es: "Practica este punto de gramática", ja: "この文法ポイントを練習する", fr: "Pratique ce point de grammaire" },
  practiceButton: { es: "Practicar", ja: "練習する", fr: "Pratiquer" },
  closePracticeButton: { es: "Cerrar práctica", ja: "練習を閉じる", fr: "Fermer la pratique" },
  generatingPracticePairs: { es: "Generando pares de práctica…", ja: "練習用のペアを生成中…", fr: "Génération des paires d'exercices…" },
  checkButton: { es: "Comprobar", ja: "確認", fr: "Vérifier" },
  nextButton: { es: "Siguiente", ja: "次へ", fr: "Suivant" },
  newGrammarNoteHeading: { es: "Nueva nota de gramática", ja: "新しい文法メモ", fr: "Nouvelle note de grammaire" },
  pasteOrTypeSentencePlaceholder: { es: "Pega o escribe una frase...", ja: "文を貼り付けるか入力してください…", fr: "Colle ou tape une phrase..." },
  lookUpTranslationButton: { es: "Buscar traducción", ja: "訳を調べる", fr: "Chercher la traduction" },
  getAiHintSummary: { es: "Obtener una pista de la IA", ja: "AIのヒントを見る", fr: "Obtenir un indice de l'IA" },
  sentenceStructureNotesLabel: { es: "Estructura de la frase / notas", ja: "文の構造・メモ", fr: "Structure de la phrase / notes" },
  nameThisPatternLabel: { es: "Nombra este patrón", ja: "このパターンに名前を付ける", fr: "Nomme ce schéma" },
  nameThisPatternPlaceholder: { es: "p. ej. Intención", ja: "例：意図", fr: "p. ex. Intention" },
  explainOwnWordsLabel: { es: "Explícalo con tus propias palabras", ja: "自分の言葉で説明する", fr: "Explique-le avec tes propres mots" },
  explainOwnWordsPlaceholder: { es: "¿Qué es este patrón y cuándo se usa?", ja: "このパターンは何で、いつ使いますか？", fr: "Qu'est-ce que ce schéma, et quand l'utilise-t-on ?" },
  identifyPatternButton: { es: "Identificar este patrón", ja: "このパターンを特定する", fr: "Identifier ce schéma" },
  examplesHeading: { es: "Ejemplos", ja: "例文", fr: "Exemples" },
  addExampleButton: { es: "+ Añadir ejemplo", ja: "+ 例文を追加", fr: "+ Ajouter un exemple" },
  relatedVariantsHeading: { es: "Variantes relacionadas", ja: "関連バリエーション", fr: "Variantes associées" },
  relatedVariantsHint: {
    es: "Una forma relacionada del mismo patrón (p. ej. la misma estructura dicha sobre otra persona) — anidada aquí en lugar de tener su propia entrada de carpeta.",
    ja: "同じパターンの関連した形（例：同じ構造を別の人について言った場合）— 独立したフォルダ項目にせず、ここにまとめています。",
    fr: "Une forme apparentée du même schéma (p. ex. la même structure à propos de quelqu'un d'autre) — imbriquée ici plutôt que dans sa propre entrée de dossier.",
  },
  addRelatedVariantButton: { es: "+ Añadir variante relacionada", ja: "+ 関連バリエーションを追加", fr: "+ Ajouter une variante associée" },
  tagsLabel: { es: "Etiquetas", ja: "タグ", fr: "Étiquettes" },
  tagsPlaceholder: { es: "p. ej. modismo reflexivo, pluscuamperfecto (separados por comas)", ja: "例：再帰的な慣用句、過去完了（カンマ区切り）", fr: "p. ex. idiome réfléchi, plus-que-parfait (séparés par des virgules)" },
  folderLabel: { es: "Carpeta", ja: "フォルダ", fr: "Dossier" },
  newButtonPlus: { es: "+ Nuevo", ja: "+ 新規", fr: "+ Nouveau" },
  saveNoteButton: { es: "Guardar nota", ja: "メモを保存", fr: "Enregistrer la note" },
  grammarPatternHeading: { es: "Patrón gramatical", ja: "文法パターン", fr: "Schéma grammatical" },
  explanationSummary: { es: "Explicación", ja: "説明", fr: "Explication" },
  testMePracticeSummary: { es: "Ponme a prueba / Practicar", ja: "テストする／練習する", fr: "Teste-moi / Pratique" },
  patternNotFound: { es: "No se pudo encontrar ese patrón gramatical.", ja: "その文法パターンが見つかりませんでした。", fr: "Impossible de trouver ce schéma grammatical." },

  // ---- Tenses overview pages ----
  spanishTensesHeading: { es: "Tiempos verbales en español", ja: "スペイン語の時制", fr: "Temps espagnols" },
  frenchTensesHeading: { es: "Tiempos verbales en francés", ja: "フランス語の時制", fr: "Temps français" },
  exampleVerbLabel: { es: "Verbo de ejemplo", ja: "例となる動詞", fr: "Verbe d'exemple" },
  testMeButton: { es: "Ponme a prueba", ja: "テストする", fr: "Teste-moi" },
  clickBoxToSeeTableHint: { es: "Haz clic en cualquier casilla para ver la tabla completa. Haz clic de nuevo (o fuera) para reducirla.", ja: "枠をクリックすると全表が表示されます。もう一度（または外を）クリックすると元に戻ります。", fr: "Clique sur une case pour voir le tableau complet. Reclique (ou clique à l'extérieur) pour le réduire." },
  pickTensesHintEs: {
    es: "Elige los tiempos verbales sobre los que quieres que te pregunten. Puede salir cualquier persona (yo/tú/él/nosotros/vosotros/ellos), con más peso hacia yo y tú. Los verbos son una mezcla de regulares e irregulares (mayormente regulares).",
    ja: "テストしたい時制を選んでください。どの人称（yo/tú/él/nosotros/vosotros/ellos）も出題されますが、yoとtúがやや多めです。動詞は規則・不規則が混ざっています（規則動詞が中心）。",
    fr: "Choisis les temps sur lesquels tu veux être testé. N'importe quelle personne (yo/tú/él/nosotros/vosotros/ellos) peut sortir, avec un peu plus de poids sur yo et tú. Les verbes sont un mélange de réguliers et d'irréguliers (surtout réguliers).",
  },
  pickTensesHintFr: {
    es: "Elige los tiempos verbales sobre los que quieres que te pregunten. je/tu/il/nous/vous/ils pueden salir todos, con más peso hacia je y tu. Los verbos son una mezcla de regulares e irregulares (mayormente regulares).",
    ja: "テストしたい時制を選んでください。je/tu/il/nous/vous/ilsのどれも出題されますが、jeとtuがやや多めです。動詞は規則・不規則が混ざっています（規則動詞が中心）。",
    fr: "Choisis les temps sur lesquels tu veux être testé. je/tu/il/nous/vous/ils peuvent tous sortir, avec un peu plus de poids sur je et tu. Les verbes sont un mélange de réguliers et d'irréguliers (surtout réguliers).",
  },
  clearButton: { es: "Borrar selección", ja: "選択をクリア", fr: "Effacer" },
  startTestButton: { es: "Comenzar prueba", ja: "テストを開始", fr: "Commencer le test" },

  // ---- Writing / Speaking hubs ----
  entriesHeading: { es: "Entradas", ja: "エントリー", fr: "Entrées" },
  writingEntriesIntro: {
    es: "Escribe una entrada tipo diario con fecha — opcionalmente enlázala a un texto de Lectura para poder consultarlo junto al editor mientras escribes.",
    ja: "日付付きの日記形式のエントリーを書きます — 必要に応じてリーディングの文章にリンクすると、書きながらエディターの横にその文章を表示して参照できます。",
    fr: "Écris une entrée façon journal datée — lie-la éventuellement à un texte de Lecture pour pouvoir le consulter à côté de l'éditeur pendant que tu écris.",
  },
  speakingEntriesIntro: {
    es: "Grábate hablando como una entrada con fecha — opcionalmente enlázala a un texto de Lectura para poder mostrarlo junto a la grabadora y leerlo en voz alta.",
    ja: "日付付きのエントリーとして自分の発話を録音します — 必要に応じてリーディングの文章にリンクすると、録音しながら文章を表示して音読できます。",
    fr: "Enregistre-toi en train de parler comme une entrée datée — lie-la éventuellement à un texte de Lecture pour pouvoir l'afficher à côté de l'enregistreur et le lire à voix haute.",
  },
  newEntryLink: { es: "+ Nueva entrada", ja: "+ 新しいエントリー", fr: "+ Nouvelle entrée" },
  teacherActivitiesHeading: { es: "Actividades del profesor", ja: "先生が設定した課題", fr: "Activités du professeur" },
  writingTeacherActivitiesComingSoon: {
    es: "Próximamente — en cuanto los profesores puedan asignar actividades de escritura, aparecerán aquí, y las entradas que escribas para ellas también serán visibles para tu profesor. Todo lo de arriba sigue siendo privado para ti.",
    ja: "近日公開 — 先生がライティング課題を設定できるようになると、ここに表示され、そのために書いたエントリーは先生にも見えるようになります。上にあるものはすべて引き続きあなただけのプライベートな内容です。",
    fr: "Bientôt disponible — dès que les professeurs pourront définir des activités d'écriture, elles apparaîtront ici, et les entrées que tu écriras pour elles seront aussi visibles par ton professeur. Tout ce qui précède reste privé.",
  },
  speakingTeacherActivitiesComingSoon: {
    es: "Próximamente — en cuanto los profesores puedan asignar actividades de habla, aparecerán aquí, y las entradas que grabes para ellas también serán visibles para tu profesor. Todo lo de arriba sigue siendo privado para ti.",
    ja: "近日公開 — 先生がスピーキング課題を設定できるようになると、ここに表示され、そのために録音したエントリーは先生にも見えるようになります。上にあるものはすべて引き続きあなただけのプライベートな内容です。",
    fr: "Bientôt disponible — dès que les professeurs pourront définir des activités orales, elles apparaîtront ici, et les entrées que tu enregistreras pour elles seront aussi visibles par ton professeur. Tout ce qui précède reste privé.",
  },

  // ---- Reading ----
  passagesHeading: { es: "Textos", ja: "文章", fr: "Textes" },
  passagesIntro: {
    es: "Pega un fragmento de texto — una canción, un artículo, lo que sea que estés estudiando — y haz clic en cualquier palabra mientras lees para buscarla y guardarla directamente en un tema del Banco de vocabulario.",
    ja: "テキストの断片を貼り付けてください — 歌、記事、勉強しているものなら何でも — 読んでいる最中に単語をクリックすると、意味を調べてそのまま単語帳のテーマに保存できます。",
    fr: "Colle un morceau de texte — une chanson, un article, tout ce que tu étudies — et clique sur n'importe quel mot en lisant pour le rechercher et l'enregistrer directement dans un thème de la Banque de vocabulaire.",
  },
  filterByFolderLabel: { es: "Filtrar por carpeta", ja: "フォルダで絞り込む", fr: "Filtrer par dossier" },
  folderOptionalLabel: { es: "Carpeta (opcional, para organizar)", ja: "フォルダ（任意、整理用）", fr: "Dossier (facultatif, pour organiser)" },
  passageTitlePlaceholder: { es: "p. ej. la letra de una canción, el nombre de un artículo...", ja: "例：曲の歌詞、記事名など…", fr: "p. ex. des paroles de chanson, le titre d'un article..." },
  pastePassagePlaceholder: { es: "Pega el texto aquí...", ja: "ここに文章を貼り付けてください…", fr: "Colle le texte ici..." },
  uploadScreenshotLabel: { es: "O sube una captura de pantalla para rellenar el texto automáticamente", ja: "またはスクリーンショットをアップロードしてテキストを自動入力する", fr: "Ou téléverse une capture d'écran pour remplir le texte automatiquement" },
  ocrHint: {
    es: "Primero lee la imagen localmente (gratis, funciona con cualquier cosa, incluidas páginas de libros). Si sale desordenado, tendrás la opción de volver a leerla con Claude (más preciso, coste pequeño, pero no puede reproducir texto de libros con derechos de autor). Recortar solo el texto del pasaje ayuda en cualquier caso.",
    ja: "まずローカルで画像を読み取ります（無料、書籍のページを含め何にでも使えます）。結果が乱れている場合は、Claudeで再度読み取るオプションがあります（より正確ですが、少額の費用がかかり、著作権のある書籍のテキストは再現できません）。どちらの場合も、文章部分だけを切り抜くと精度が上がります。",
    fr: "Lit d'abord l'image localement (gratuit, fonctionne sur tout, y compris les pages de livres). Si le résultat est confus, tu auras la possibilité de la relire avec Claude (plus précis, coût minime, mais ne peut pas reproduire un texte de livre protégé par le droit d'auteur). Recadrer sur le texte du passage aide dans les deux cas.",
  },
  dragDropImageHint: { es: "Arrastra y suelta una imagen aquí, o", ja: "ここに画像をドラッグ＆ドロップするか、", fr: "Glisse-dépose une image ici, ou" },
  tryClaudeReaderButton: { es: "Probar el lector más preciso de Claude", ja: "Claudeのより正確なリーダーを試す", fr: "Essayer le lecteur plus précis de Claude" },
  saveStartReadingButton: { es: "Guardar y empezar a leer", ja: "保存して読み始める", fr: "Enregistrer et commencer à lire" },
  grammarNotesPrefix: { es: "Notas de gramática (", ja: "文法メモ（", fr: "Notes de grammaire (" },
  grammarNotesHeading: { es: "Notas de gramática", ja: "文法メモ", fr: "Notes de grammaire" },
  savedFromPassageHeading: { es: "Guardado desde este texto", ja: "この文章から保存", fr: "Enregistré depuis ce texte" },
  openInVocabBankLink: { es: "Abrir en el Banco de vocabulario", ja: "単語帳で開く", fr: "Ouvrir dans la Banque de vocabulaire" },
  wordKanjiLabel: { es: "Palabra / kanji", ja: "単語・漢字", fr: "Mot / kanji" },
  furiganaLabel: { es: "Furigana", ja: "ふりがな", fr: "Furigana" },
  meaningLabel: { es: "Significado", ja: "意味", fr: "Signification" },
  themeLabel: { es: "Tema", ja: "テーマ", fr: "Thème" },
  infinitiveLabel: { es: "Infinitivo / forma de diccionario (opcional)", ja: "辞書形（任意）", fr: "Infinitif / forme du dictionnaire (facultatif)" },
  generateExamplesButton: { es: "✨ Generar 3 ejemplos", ja: "✨ 例文を3つ生成", fr: "✨ Générer 3 exemples" },
  generatingExamplesStatus: { es: "Generando…", ja: "生成中…", fr: "Génération en cours…" },
  generateExamplesFailedHint: { es: "No se pudieron generar ejemplos. Inténtalo de nuevo.", ja: "例文を生成できませんでした。もう一度お試しください。", fr: "Impossible de générer des exemples. Réessaie." },
  saveToVocabButton: { es: "Guardar en el vocabulario", ja: "単語帳に保存", fr: "Enregistrer dans le vocabulaire" },
  readerHint: { es: "Haz clic en cualquier palabra para buscarla. Arrastra para seleccionar una frase u oración y guardar una nota de gramática.", ja: "単語をクリックすると意味を調べられます。ドラッグしてフレーズや文を選択すると文法メモとして保存できます。", fr: "Clique sur n'importe quel mot pour le rechercher. Fais glisser pour sélectionner une expression ou une phrase et enregistrer une note de grammaire." },
  deletePassageButton: { es: "Eliminar este texto", ja: "この文章を削除", fr: "Supprimer ce texte" },
  passageNotFoundText: { es: "Texto no encontrado.", ja: "文章が見つかりません。", fr: "Texte introuvable." },
  allFoldersOption: { es: "Todas las carpetas", ja: "すべてのフォルダ", fr: "Tous les dossiers" },
  noFolderRandomPassagesOption: { es: "Sin carpeta (textos sueltos)", ja: "フォルダなし（ランダムな文章）", fr: "Aucun dossier (textes libres)" },
  noFolderRandomPassageOption: { es: "Sin carpeta (texto suelto)", ja: "フォルダなし（ランダムな文章）", fr: "Aucun dossier (texte libre)" },
  noPassagesInFolderYetText: { es: "Todavía no hay textos en esta carpeta.", ja: "このフォルダにはまだ文章がありません。", fr: "Pas encore de textes dans ce dossier." },
  noPassagesYetText: { es: "Todavía no hay textos — pega uno abajo para empezar.", ja: "まだ文章がありません — 下にテキストを貼り付けて始めましょう。", fr: "Pas encore de textes — colle-en un ci-dessous pour commencer." },
  kanjiInDeckNotice: { es: "Deberías conocer este kanji — ¡está en tu mazo! Intenta recordarlo antes de revelarlo.", ja: "この漢字は知っているはずです — デッキに入っています！ 表示する前に思い出してみましょう。", fr: "Tu devrais connaître ce kanji — il est dans ton paquet ! Essaie de t'en souvenir avant de le révéler." },
  kanjiInDeckNoticeShort: { es: "Deberías conocer este kanji — ¡está en tu mazo!", ja: "この漢字は知っているはずです — デッキに入っています！", fr: "Tu devrais connaître ce kanji — il est dans ton paquet !" },
  noNotesSavedFromPassageText: { es: "Todavía no hay notas guardadas de este texto.", ja: "この文章から保存されたメモはまだありません。", fr: "Pas encore de notes enregistrées depuis ce texte." },
  noTasksYetText: { es: "Todavía no hay tareas — añade una arriba.", ja: "まだタスクがありません — 上に追加してください。", fr: "Pas encore de tâches — ajoutes-en une ci-dessus." },
  nothingToShowCompletedHiddenText: { es: "Nada que mostrar — las tareas completadas están ocultas.", ja: "表示するものがありません — 完了したタスクは非表示です。", fr: "Rien à afficher — les tâches terminées sont masquées." },
  startedColumnLabel: { es: "Empezado", ja: "開始", fr: "Commencé" },
  doneColumnLabel: { es: "Hecho", ja: "完了", fr: "Terminé" },
  whichOneLabel: { es: "¿Cuál?", ja: "どれ？", fr: "Lequel ?" },
  newThemeOption: { es: "+ Nuevo tema…", ja: "+ 新しいテーマ…", fr: "+ Nouveau thème…" },
  newEntryOption: { es: "+ Nueva entrada", ja: "+ 新しいエントリー", fr: "+ Nouvelle entrée" },
  newThemeButtonPlus: { es: "+ Nuevo tema", ja: "+ 新しいテーマ", fr: "+ Nouveau thème" },
  addToThemeButton: { es: "Añadir al tema", ja: "テーマに追加", fr: "Ajouter au thème" },
  showMeaningButton: { es: "Mostrar significado", ja: "意味を表示", fr: "Afficher la signification" },
  addToVocabDeckButton: { es: "Añadir al mazo de vocabulario", ja: "単語カードに追加", fr: "Ajouter au paquet de vocabulaire" },
  showInVocabSectionButton: { es: "Mostrar en la sección de vocabulario", ja: "単語帳セクションで表示", fr: "Afficher dans la section vocabulaire" },
  saveAsGrammarNoteButton: { es: "Guardar como nota de gramática", ja: "文法メモとして保存", fr: "Enregistrer comme note de grammaire" },

  // ---- Quiz ----
  quizHeadingPrefix: { es: "Prueba —", ja: "クイズ —", fr: "Quiz —" },
  vocabularyLabel: { es: "Vocabulario", ja: "単語", fr: "Vocabulaire" },
  verbConjugationLabel: { es: "Conjugación verbal", ja: "動詞の活用", fr: "Conjugaison" },
  themesToIncludeHint: { es: "Temas a incluir (por defecto solo este — marca más para combinarlos):", ja: "含めるテーマ（デフォルトはこれだけ — 組み合わせたい場合は他もチェック）：", fr: "Thèmes à inclure (par défaut, seulement celui-ci — coche-en d'autres pour les combiner) :" },
  englishToTargetLabel: { es: "Inglés → Idioma objetivo", ja: "英語 → 対象言語", fr: "Anglais → Langue cible" },
  targetToEnglishLabel: { es: "Idioma objetivo → Inglés", ja: "対象言語 → 英語", fr: "Langue cible → Anglais" },
  alsoDrillTablesLabel: { es: "También practicar las tablas de conjugación guardadas", ja: "保存済みの活用表も練習する", fr: "Aussi s'entraîner sur les tableaux de conjugaison enregistrés" },
  conjugationQuizHint: {
    es: "Preguntas sobre los verbos encontrados en los temas de arriba — una palabra cuenta como verbo si su lado en español es exactamente el infinitivo (p. ej. \"hablar\"), no una forma conjugada.",
    ja: "上のテーマにある動詞から出題します — スペイン語側がちょうど不定詞（例：「hablar」）である場合のみ動詞としてカウントされ、活用形はカウントされません。",
    fr: "Questions sur les verbes trouvés dans les thèmes ci-dessus — un mot compte comme verbe si son côté espagnol est exactement l'infinitif (p. ex. « hablar »), pas une forme conjuguée.",
  },
  limitToRandomLabel: { es: "Limitar a un número aleatorio de", ja: "ランダムに", fr: "Limiter à un nombre aléatoire de" },
  cardsLabel: { es: "tarjetas", ja: "枚のカードに制限", fr: "cartes" },
  startQuizButton: { es: "Comenzar prueba", ja: "クイズを開始", fr: "Commencer le quiz" },
  showAnswerButton: { es: "Mostrar respuesta", ja: "答えを表示", fr: "Afficher la réponse" },
  gotItButton: { es: "Lo sabía", ja: "わかった", fr: "J'ai bon" },
  reviewAgainButton: { es: "Repasar de nuevo", ja: "もう一度復習", fr: "Revoir encore" },
  typeConjugatedFormPlaceholder: { es: "Escribe la forma conjugada...", ja: "活用形を入力してください…", fr: "Tape la forme conjuguée..." },
  markCorrectButton: { es: "En realidad, marcar como correcto", ja: "実際は正解としてマークする", fr: "En fait, marquer comme correct" },
  doneForNow: { es: "Terminado por ahora.", ja: "今のところ終了です。", fr: "Terminé pour l'instant." },
  setUpAnotherQuizButton: { es: "Configurar otra prueba", ja: "別のクイズを設定する", fr: "Configurer un autre quiz" },

  // ---- Writing entry / Speaking entry ----
  vocabCheckButton: { es: "Revisión de vocabulario", ja: "語彙チェック", fr: "Vérif. vocabulaire" },
  grammarCheckButton: { es: "Revisión de gramática", ja: "文法チェック", fr: "Vérif. grammaire" },
  vocabCheckExplainer: {
    es: "La revisión de vocabulario busca cualquier <word> que quede en tu escrito y lo reemplaza por la palabra real — las palabras reemplazadas se muestran en rojo para que quede claro qué se corrigió.",
    ja: "語彙チェックは、書いた文章に残っている<word>を調べて実際の単語に置き換えます — 置き換えられた単語は赤で表示され、何が修正されたか一目でわかります。",
    fr: "La vérification de vocabulaire recherche tout <word> encore présent dans ton texte et le remplace par le vrai mot — les mots remplacés sont affichés en rouge pour bien voir ce qui a été corrigé.",
  },
  grammarCheckExplainer: {
    es: "La revisión de gramática lee toda la entrada en busca de errores reales a nivel de frase — conjugación, concordancia, partículas, orden de palabras — y los corrige, también mostrados en rojo. Separada de la revisión de vocabulario a propósito.",
    ja: "文法チェックはエントリー全体を読み、活用・一致・助詞・語順などの本当の文レベルの間違いを見つけて修正します。こちらも赤で表示されます。語彙チェックとはあえて分けています。",
    fr: "La vérification de grammaire lit toute l'entrée à la recherche de vraies erreurs au niveau de la phrase — conjugaison, accords, particules, ordre des mots — et les corrige, également affichées en rouge. Volontairement séparée de la vérification de vocabulaire.",
  },
  beforeAfterGrammarCheckSummary: { es: "Antes / después de la revisión de gramática", ja: "文法チェックの前後", fr: "Avant / après la vérification de grammaire" },
  beforeLabel: { es: "Antes", ja: "前", fr: "Avant" },
  afterLabel: { es: "Después", ja: "後", fr: "Après" },
  whatGrammarCheckChangedSummary: { es: "Qué cambió la revisión de gramática", ja: "文法チェックで変更された点", fr: "Ce que la vérification de grammaire a changé" },
  originalEntrySummary: { es: "Entrada original (tal como se escribió)", ja: "元のエントリー（最初に書いたまま）", fr: "Entrée originale (telle qu'écrite au départ)" },
  currentVersionSummary: { es: "Versión actual (correcciones en rojo)", ja: "現在のバージョン（修正は赤）", fr: "Version actuelle (corrections en rouge)" },
  entryTitlePlaceholder: { es: "p. ej. Mi fin de semana", ja: "例：私の週末", fr: "p. ex. Mon week-end" },
  dateLabel: { es: "Fecha", ja: "日付", fr: "Date" },
  linkPassageOptionalLabel: { es: "Enlazar a un texto de Lectura (opcional)", ja: "リーディングの文章にリンク（任意）", fr: "Lier à un texte de Lecture (facultatif)" },
  noLinkOption: { es: "Sin enlace", ja: "リンクなし", fr: "Aucun lien" },
  linkingPassageHint: { es: "Enlazar un texto lo añade como una pestaña abajo para que puedas consultarlo mientras escribes.", ja: "文章をリンクすると下にタブとして追加され、書きながら参照できます。", fr: "Lier un texte l'ajoute comme onglet ci-dessous pour que tu puisses le consulter en écrivant." },
  yourWritingLabel: { es: "Tu escrito", ja: "あなたの文章", fr: "Ton texte" },
  yourWritingPlaceholder: { es: "Escribe tu entrada aquí... ¿no sabes una palabra? enciérrala entre paréntesis angulares, p. ej. <keys>", ja: "ここにエントリーを書いてください…わからない単語がある？山括弧で囲んでください、例：<keys>", fr: "Écris ton entrée ici... tu ne connais pas un mot ? mets-le entre chevrons, p. ex. <keys>" },
  bracketWordsHint: {
    es: "¿No sabes una palabra (o frase corta) en el idioma objetivo? Enciérrala entre paréntesis angulares, como <keys> — quedará registrada en tu Cuaderno de ayuda, y podrás cambiarla por la palabra real más tarde con la revisión de vocabulario. Para verbos, encierra el infinitivo (<to eat>, no <ate>) — la revisión de vocabulario solo busca la forma de diccionario, no la forma conjugada correcta; conjugar bien en tu frase sigue siendo cosa tuya por ahora.",
    ja: "対象言語で知らない単語（または短いフレーズ）がありますか？<keys>のように山括弧で囲んでください — ヘルパーノートに記録され、後で語彙チェックを使って実際の単語に置き換えられます。動詞の場合は原形を囲んでください（<to eat>であって<ate>ではありません）— 語彙チェックは辞書形しか調べないので、文中で正しく活用させるのは今のところ自分の役目です。",
    fr: "Tu ne connais pas un mot (ou une courte expression) dans la langue cible ? Mets-le entre chevrons, comme <keys> — il sera enregistré dans ton Cahier d'aide, et tu pourras le remplacer par le vrai mot plus tard avec la vérification de vocabulaire. Pour les verbes, mets l'infinitif entre chevrons (<to eat>, pas <ate>) — la vérification de vocabulaire ne cherche que la forme du dictionnaire ; conjuguer correctement dans ta phrase reste ton travail pour l'instant.",
  },
  saveEntryButton: { es: "Guardar entrada", ja: "エントリーを保存", fr: "Enregistrer l'entrée" },
  openWhichPassageOption: { es: "¿Abrir qué texto?", ja: "どの文章を開きますか？", fr: "Ouvrir quel texte ?" },
  noPassageOpenHint: { es: "Ningún texto abierto — haz clic en + para añadir uno, o enlaza uno arriba.", ja: "開いている文章がありません — ＋をクリックして追加するか、上でリンクしてください。", fr: "Aucun texte ouvert — clique sur + pour en ajouter un, ou lie-en un ci-dessus." },
  referenceWhileWritingHeading: { es: "Consulta mientras escribes", ja: "書きながら参照", fr: "Référence pendant que tu écris" },
  referenceWhileWritingHint: { es: "Abre un texto de Lectura (o el que tengas enlazado) aquí para consultarlo mientras escribes.", ja: "ここでリーディングの文章（またはリンクした文章）を開いて、書きながら参照できます。", fr: "Ouvre un texte de Lecture (ou celui que tu as lié) ici pour le consulter en écrivant." },
  deleteEntryButton: { es: "Eliminar esta entrada", ja: "このエントリーを削除", fr: "Supprimer cette entrée" },
  vocabFromBracketsHeading: { es: "Vocabulario de los paréntesis", ja: "山括弧からの語彙", fr: "Vocabulaire entre chevrons" },
  vocabFromBracketsHint: { es: "Palabras que has puesto entre paréntesis mientras escribías, esperando ser aprendidas. Ejecuta la revisión de vocabulario para completarlas.", ja: "書いている間に山括弧で囲んだ、まだ学習していない単語です。語彙チェックを実行すると埋められます。", fr: "Mots que tu as mis entre chevrons en écrivant, en attente d'être appris. Lance la vérification de vocabulaire pour les compléter." },
  notesForYourselfHeading: { es: "Notas para ti mismo/a", ja: "自分へのメモ", fr: "Notes pour toi-même" },
  notesForYourselfHint: { es: "Privado — solo para ti. (Las mismas notas que el Cuaderno de ayuda del Espacio personal.)", ja: "非公開 — あなただけのものです。（パーソナルハブのヘルパーノートと同じメモです。）", fr: "Privé — juste pour toi. (Les mêmes notes que le Cahier d'aide de l'Espace personnel.)" },
  anythingToRememberPlaceholder: { es: "Cualquier cosa que quieras recordar…", ja: "覚えておきたいことを何でも…", fr: "N'importe quoi que tu veuilles te rappeler…" },
  questionsForTeacherHeading: { es: "Preguntas para tu profesor", ja: "先生への質問", fr: "Questions pour ton professeur" },
  questionsForTeacherHint: { es: "No privado — en cuanto exista una conexión con un profesor, podrá ver esto (pero nunca tus notas personales de arriba).", ja: "非公開ではありません — 先生とのつながりができると、これは見られるようになります（ただし上の個人的なメモは見られません）。", fr: "Pas privé — dès qu'une connexion avec un professeur existera, il pourra voir ceci (mais jamais tes notes personnelles ci-dessus)." },
  anythingToAskPlaceholder: { es: "Cualquier cosa que quieras preguntar…", ja: "聞きたいことを何でも…", fr: "N'importe quoi que tu veuilles demander…" },
  speakingEntryTitlePlaceholder: { es: "p. ej. Pidiendo en un café", ja: "例：カフェで注文する", fr: "p. ex. Commander dans un café" },
  linkingPassageReadAloudHint: { es: "Enlazar un texto lo añade como una pestaña abajo para que puedas leerlo en voz alta mientras grabas.", ja: "文章をリンクすると下にタブとして追加され、録音しながら音読できます。", fr: "Lier un texte l'ajoute comme onglet ci-dessous pour que tu puisses le lire à voix haute en enregistrant." },
  savedStatus: { es: "Guardado.", ja: "保存しました。", fr: "Enregistré." },
  recordingHeading: { es: "Grabación", ja: "録音", fr: "Enregistrement" },
  recordButton: { es: "Grabar", ja: "録音", fr: "Enregistrer" },
  stopRecordingButton: { es: "Detener", ja: "停止", fr: "Arrêter" },
  deleteRecordingButton: { es: "Eliminar grabación", ja: "録音を削除", fr: "Supprimer l'enregistrement" },
  readWhileSpeakHeading: { es: "Lee mientras hablas", ja: "話しながら読む", fr: "Lis pendant que tu parles" },
  readWhileSpeakHint: { es: "Abre aquí un texto de Lectura (o el que tengas enlazado) o una de tus entradas de Escritura para leer en voz alta mientras grabas.", ja: "ここでリーディングの文章（またはリンクした文章）や自分のライティングのエントリーを開いて、録音しながら音読できます。", fr: "Ouvre ici un texte de Lecture (ou celui que tu as lié) ou une de tes entrées d'Écriture pour le lire à voix haute en enregistrant." },
  readingOrWritingOption: { es: "¿Lectura o Escritura?", ja: "リーディングかライティングか？", fr: "Lecture ou Écriture ?" },
  readingPassageOption: { es: "Texto de Lectura", ja: "リーディングの文章", fr: "Texte de Lecture" },
  writingEntryOption: { es: "Entrada de Escritura", ja: "ライティングのエントリー", fr: "Entrée d'Écriture" },
  openWhichOneOption: { es: "¿Abrir cuál?", ja: "どれを開きますか？", fr: "Ouvrir lequel ?" },
  nothingOpenToReadHint: { es: "Nada abierto para leer — haz clic en + para añadir un texto o una entrada de Escritura, o enlaza un texto arriba.", ja: "読むために開いているものがありません — ＋をクリックして文章やライティングのエントリーを追加するか、上で文章をリンクしてください。", fr: "Rien d'ouvert à lire — clique sur + pour ajouter un texte ou une entrée d'Écriture, ou lie un texte ci-dessus." },

  // ---- Grammar app dynamic UI (buttons/labels created in JS) ----
  folderNotFoundText: { es: "Carpeta no encontrada", ja: "フォルダが見つかりません", fr: "Dossier introuvable" },
  noExamplesYetText: { es: "Todavía no hay ejemplos.", ja: "まだ例文がありません。", fr: "Pas encore d'exemples." },
  noNotesInFolderText: { es: "Todavía no hay notas en esta carpeta.", ja: "このフォルダにはまだメモがありません。", fr: "Pas encore de notes dans ce dossier." },
  editPersonalNoteButton: { es: "Editar nota personal", ja: "個人メモを編集", fr: "Modifier la note personnelle" },
  deleteNoteButton: { es: "Eliminar nota", ja: "メモを削除", fr: "Supprimer la note" },
  noPointIdentifiedText: { es: "No se identificó un punto gramatical claro.", ja: "明確な文法ポイントは特定されませんでした。", fr: "Aucun point de grammaire clair identifié." },
  testMeOnThisButton: { es: "Ponme a prueba con esto", ja: "これでテストする", fr: "Teste-moi là-dessus" },
  tryAgainButton: { es: "Intentar de nuevo", ja: "もう一度試す", fr: "Réessayer" },
  missedItButton: { es: "No lo sabía", ja: "わからなかった", fr: "Raté" },
  noPointFoundYetText: { es: "Todavía no se ha encontrado un punto gramatical claro.", ja: "まだ明確な文法ポイントが見つかっていません。", fr: "Pas encore de point de grammaire clair trouvé." },
  acceptButton: { es: "Aceptar", ja: "承認する", fr: "Accepter" },
  undoButton: { es: "Deshacer", ja: "元に戻す", fr: "Annuler l'action" },
  recheckLinkText: { es: "Volver a comprobar", ja: "再チェック", fr: "Revérifier" },
  removeVariantButton: { es: "Eliminar variante", ja: "バリエーションを削除", fr: "Supprimer la variante" },
  translationLabel: { es: "Traducción", ja: "翻訳", fr: "Traduction" },
  useThisButton: { es: "Usar esto", ja: "これを使う", fr: "Utiliser ceci" },
  removeButton: { es: "Eliminar", ja: "削除", fr: "Supprimer" },

  // ---- Writing app dynamic UI ----
  autosaveSavedStatus: { es: "Guardado", ja: "保存しました", fr: "Enregistré" },
  unsavedChangesStatus: { es: "Cambios sin guardar…", ja: "未保存の変更…", fr: "Modifications non enregistrées…" },
  addToVocabButton: { es: "Añadir al vocabulario", ja: "単語帳に追加", fr: "Ajouter au vocabulaire" },
  addNotePlusButton: { es: "+ Nota", ja: "+ メモ", fr: "+ Note" },
  editNoteButton: { es: "Editar nota", ja: "メモを編集", fr: "Modifier la note" },
  addToGrammarButton: { es: "Añadir a Gramática", ja: "文法に追加", fr: "Ajouter à Grammaire" },
  noWritingYetText: { es: "Todavía no hay escritura — haz clic en Editar para añadir algo.", ja: "まだ文章がありません — 「編集」をクリックして書き始めてください。", fr: "Pas encore de texte — clique sur Modifier pour en ajouter." },

  // ---- Vocab app dynamic UI ----
  extractingStatus: { es: "Extrayendo...", ja: "抽出中…", fr: "Extraction..." },
  deleteThemeButton: { es: "Eliminar tema", ja: "テーマを削除", fr: "Supprimer le thème" },
  noWordsYetText: { es: "Todavía no hay palabras — añade una arriba.", ja: "まだ単語がありません — 上で追加してください。", fr: "Pas encore de mots — ajoutes-en un ci-dessus." },
  moveCopyButton: { es: "Mover/Copiar", ja: "移動／コピー", fr: "Déplacer/Copier" },
  moveButton: { es: "Mover", ja: "移動", fr: "Déplacer" },
  copyButton: { es: "Copiar", ja: "コピー", fr: "Copier" },
  addThemeWithWordsFirstText: { es: "Primero añade un tema con algunas palabras.", ja: "まず単語のあるテーマを追加してください。", fr: "Ajoute d'abord un thème avec quelques mots." },

  // ---- Personal Hub dynamic UI ----
  noBubblesYetText: { es: "Todavía no hay burbujas — añade una arriba.", ja: "まだバブルがありません — 上で追加してください。", fr: "Pas encore de bulles — ajoutes-en une ci-dessus." },
};

function isImmersionEnabled() {
  return localStorage.getItem(IMMERSION_ENABLED_KEY) === "true";
}

function setImmersionEnabled(enabled) {
  localStorage.setItem(IMMERSION_ENABLED_KEY, enabled ? "true" : "false");
}

// ---- Generic engine ----
// Rather than a hand-maintained list of CSS selectors (which only ever
// covered the shared nav chrome), any element on any page can opt in
// to translation just by carrying a data-immersion-key attribute in
// its HTML (or having one set on it at creation time, for elements a
// page's own JS builds). What gets swapped — the element's visible
// text, or an attribute like placeholder/value/title — is inferred
// from the tag, with data-immersion-attr as an escape hatch for
// anything unusual.

function immersionAttrFor(el) {
  if (el.dataset.immersionAttr) return el.dataset.immersionAttr;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return "placeholder";
  return "textContent";
}

function readAttr(el, attr) {
  if (attr === "textContent") return el.textContent;
  const val = el.getAttribute(attr);
  return val === null ? "" : val;
}

function writeAttr(el, attr, value) {
  if (attr === "textContent") {
    el.textContent = value;
    return;
  }
  el.setAttribute(attr, value);
  // Keep the live DOM property (not just the HTML attribute) in sync
  // for the handful of attrs browsers mirror onto a property, so an
  // already-rendered input/button actually shows the new text.
  if (attr === "placeholder" || attr === "value" || attr === "title") {
    try {
      el[attr] = value;
    } catch (e) {}
  }
}

// Swaps one element's text (or whichever attribute applies) to the
// target language, remembering the original English first so turning
// immersion back off can restore it exactly rather than needing a
// page reload.
function setImmersionText(el, stringKey, lang) {
  if (!el) return;
  const entry = IMMERSION_STRINGS[stringKey];
  if (!entry || !entry[lang]) return;

  const attr = immersionAttrFor(el);
  if (el.dataset.immersionOriginal === undefined) {
    el.dataset.immersionOriginal = readAttr(el, attr);
  }
  writeAttr(el, attr, entry[lang]);
  if (attr === "textContent") el.classList.add("immersion-text");
}

function revertImmersionText(el) {
  if (!el || el.dataset.immersionOriginal === undefined) return;
  const attr = immersionAttrFor(el);
  writeAttr(el, attr, el.dataset.immersionOriginal);
  el.classList.remove("immersion-text");
}

function applyImmersionToTree(root, lang, enabled) {
  if (!root || !root.querySelectorAll) return;
  const nodes = root.matches && root.matches("[data-immersion-key]") ? [root] : [];
  root.querySelectorAll("[data-immersion-key]").forEach((el) => nodes.push(el));
  nodes.forEach((el) => {
    const key = el.dataset.immersionKey;
    if (enabled) setImmersionText(el, key, lang);
    else revertImmersionText(el);
  });
}

// Any page can build UI dynamically (a rendered list of grammar notes,
// vocab words, to-do groups, etc.) long after the page first loads.
// Rather than asking every one of those render functions to remember
// to call back into immersion.js, a MutationObserver just watches for
// new elements and translates any tagged ones automatically the
// moment they appear — the render code only has to set
// data-immersion-key when it builds an element, nothing more.
let immersionMutationObserver = null;

function startImmersionObserver() {
  if (immersionMutationObserver || typeof MutationObserver === "undefined") return;
  immersionMutationObserver = new MutationObserver((mutations) => {
    const lang = document.body.dataset.immersionLang;
    if (!lang) return; // immersion off — newly-added nodes stay in English
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.nodeType === 1) applyImmersionToTree(node, lang, true);
      });
    });
  });
  immersionMutationObserver.observe(document.body, { childList: true, subtree: true });
}

function applyImmersion(lang) {
  const enabled = isImmersionEnabled() && SUPPORTED_LANGUAGES.includes(lang);
  document.body.dataset.immersionLang = enabled ? lang : "";

  applyImmersionToTree(document.body, lang, enabled);
  startImmersionObserver();

  // The language name in the header ("Japanese", "Spanish", "French")
  // is the one thing always on screen with nothing to open first — the
  // clearest possible proof the switch actually did something. Reuses
  // the same native-name entries the "Change language" dropdown uses
  // (langNameEs/Ja/Fr), just picked by whichever language is CURRENT.
  const labelEl = document.getElementById("topbar-lang-label");
  const nativeNameKey = { es: "langNameEs", ja: "langNameJa", fr: "langNameFr" }[lang];
  if (labelEl && nativeNameKey) {
    if (enabled) setImmersionText(labelEl, nativeNameKey, lang);
    else revertImmersionText(labelEl);
  }
}

// ---- Highlight-to-translate popup ----
// A small floating box, created once and reused, positioned next to
// whatever text was just selected — works the same on every page
// since it's injected here rather than relying on any page's own
// markup (unlike Reading's lookup panel, which only exists on Reading
// pages).

let immersionPopupEl = null;

function getImmersionPopup() {
  if (immersionPopupEl) return immersionPopupEl;
  immersionPopupEl = document.createElement("div");
  immersionPopupEl.className = "immersion-popup";
  immersionPopupEl.hidden = true;
  document.body.appendChild(immersionPopupEl);
  return immersionPopupEl;
}

function hideImmersionPopup() {
  if (immersionPopupEl) immersionPopupEl.hidden = true;
}

function positionImmersionPopup(popup, range) {
  const rect = range.getBoundingClientRect();
  const top = rect.bottom + window.scrollY + 6;
  const left = Math.max(8, rect.left + window.scrollX);
  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;
}

async function handleImmersionSelection() {
  const lang = document.body.dataset.immersionLang;
  if (!lang) return; // immersion off — nothing to translate

  const selection = window.getSelection();
  const text = selection && selection.toString().trim();
  if (!text || !selection.rangeCount) {
    hideImmersionPopup();
    return;
  }

  const anchorEl = selection.anchorNode && (selection.anchorNode.nodeType === 3 ? selection.anchorNode.parentElement : selection.anchorNode);
  if (!anchorEl || !anchorEl.closest(".immersion-text")) {
    hideImmersionPopup();
    return;
  }

  const popup = getImmersionPopup();
  const range = selection.getRangeAt(0);
  positionImmersionPopup(popup, range);
  popup.textContent = "…";
  popup.hidden = false;

  try {
    const result = await Translate.lookupTranslation(text, lang, "en");
    popup.textContent = (result && result.translation) || "No translation found.";
  } catch (e) {
    popup.textContent = "Couldn't look that up — check your connection.";
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("mouseup", handleImmersionSelection);
  document.addEventListener("touchend", handleImmersionSelection);
}

// ---- Topbar toggle switch ----
// A real on/off switch (not just an icon button), sitting right next
// to the language name — the one thing on every page that's always
// visible with no menu to open first, so flipping the switch has an
// immediate, obvious effect instead of only changing things tucked
// inside hidden dropdowns/panels.

function addImmersionToggle(bar) {
  if (!bar || bar.querySelector(".topbar-immersion-toggle")) return;
  const label = document.getElementById("topbar-lang-label");
  if (!label) return;

  const wrapper = document.createElement("label");
  wrapper.className = "topbar-immersion-toggle";
  wrapper.title = "Immersion mode — show menus and the language name in the language you're learning";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.setAttribute("aria-label", "Toggle immersion mode");
  checkbox.checked = isImmersionEnabled();

  const track = document.createElement("span");
  track.className = "topbar-immersion-track";

  checkbox.addEventListener("change", () => {
    setImmersionEnabled(checkbox.checked);
    applyImmersion(currentImmersionLangHint);
  });

  wrapper.appendChild(checkbox);
  wrapper.appendChild(track);
  label.insertAdjacentElement("afterend", wrapper);
}

// initTopbar(lang) (topbar.js) calls this — keeping a module-level
// fallback of the last-seen language so the toggle button's own click
// handler (which fires long after initTopbar ran) still knows which
// language to switch into without needing topbar.js to pass it again.
let currentImmersionLangHint = null;

function initImmersion(lang) {
  currentImmersionLangHint = lang;
  const bar = document.getElementById("app-topbar");
  addImmersionToggle(bar);
  applyImmersion(lang);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { initImmersion, applyImmersion, isImmersionEnabled, setImmersionEnabled, IMMERSION_STRINGS };
} else {
  window.initImmersion = initImmersion;
}
