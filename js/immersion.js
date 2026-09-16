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
  sectionPersonalHub: { es: "Centro principal", ja: "メインハブ", fr: "Espace principal" },
  sectionListening: { es: "Escucha", ja: "リスニング", fr: "Écoute" },
  allLanguagesLink: { es: "Todos los idiomas", ja: "すべての言語", fr: "Toutes les langues" },
  langHomeEyebrow: { es: "Inicio de idioma", ja: "言語ホーム", fr: "Accueil linguistique" },
  langHomeTitle: { es: "¿Dónde quieres trabajar hoy?", ja: "今日はどこで作業する？", fr: "Où veux-tu travailler aujourd'hui ?" },
  backToWelcome: { es: "Volver al inicio", ja: "トップに戻る", fr: "Retour à l'accueil" },
  mainHubHeroBadge: { es: "Cuaderno y archivos", ja: "ノート＆ファイル", fr: "Cahier et fichiers" },
  mainHubHeroDesc: {
    es: "Cuaderno de clase, Casillero de almacenamiento, Cuaderno de ayuda y tus propias burbujas de notas — todo lo que no es un ejercicio.",
    ja: "クラスノート、保管庫、ヘルパーノート、自分だけのメモバブル — ドリル以外のすべて。",
    fr: "Cahier de classe, Casier de stockage, Cahier d'aide et tes propres bulles de notes — tout ce qui n'est pas un exercice.",
  },
  newSectionButton: { es: "Nueva sección", ja: "新しいセクション", fr: "Nouvelle section" },
  addSectionLabel: { es: "Añadir sección", ja: "セクションを追加", fr: "Ajouter une section" },
  fullConjugationTestTitle: { es: "Prueba de conjugación completa", ja: "活用テスト（全体）", fr: "Test de conjugaison complet" },
  fullConjugationTestSub: {
    es: "Ejercicios corregidos automáticamente con todas las formas verbales, no solo esta.",
    ja: "このパターンだけでなく、すべての活用形を対象にしたコンピューター採点のドリル。",
    fr: "Exercices corrigés automatiquement portant sur toutes les formes verbales, pas seulement celle-ci.",
  },
  startLabel: { es: "Empezar", ja: "開始", fr: "Commencer" },

  // ---- Generic, reused across many pages ----
  backPlain: { es: "← Volver", ja: "← 戻る", fr: "← Retour" },
  backToThemes: { es: "← Volver a los temas", ja: "← テーマに戻る", fr: "← Retour aux thèmes" },
  backToGrammar: { es: "← Volver a Gramática", ja: "← 文法に戻る", fr: "← Retour à Grammaire" },
  backToFolder: { es: "← Volver a la carpeta", ja: "← フォルダに戻る", fr: "← Retour au dossier" },
  backToMainHub: { es: "← Volver al Centro principal", ja: "← メインハブに戻る", fr: "← Retour à l'Espace principal" },
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

  // ---- Main Hub ----
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
  storageLockerHeading: { es: "Casillero de almacenamiento", ja: "保管庫", fr: "Casier de stockage" },
  storageLockerIntro: {
    es: "Guarda un enlace a un PDF, documento de Word o cualquier otra cosa útil — ponle un título, pega el enlace, y se abrirá en una pestaña nueva cuando lo necesites.",
    ja: "PDFやWord文書、その他役立つもののリンクを保存しましょう — タイトルを付けてリンクを貼れば、必要なときに新しいタブで開きます。",
    fr: "Enregistre un lien vers un PDF, un document Word ou autre chose d'utile — donne-lui un titre, colle le lien, et il s'ouvrira dans un nouvel onglet quand tu en auras besoin.",
  },
  addLinkButton: { es: "+ Añadir enlace", ja: "+ リンクを追加", fr: "+ Ajouter un lien" },
  storageLockerTitlePlaceholder: { es: "p. ej. Tarea del capítulo 4", ja: "例：第4章の宿題", fr: "p. ex. Devoirs du chapitre 4" },
  linkLabel: { es: "Enlace", ja: "リンク", fr: "Lien" },
  storageLockerUrlPlaceholder: { es: "https://...", ja: "https://...", fr: "https://..." },
  storageLockerDropzoneText: {
    es: "Arrastra un PDF o documento de Word aquí, o haz clic para elegir un archivo",
    ja: "PDFまたはWord文書をここにドラッグするか、クリックしてファイルを選択",
    fr: "Glisse un PDF ou un document Word ici, ou clique pour choisir un fichier",
  },
  noStorageLockerItemsText: {
    es: "Todavía no hay nada guardado — añade un enlace o arrastra un archivo arriba.",
    ja: "まだ何も保存されていません — 上でリンクを追加するかファイルをドラッグしてください。",
    fr: "Rien d'enregistré pour l'instant — ajoute un lien ou dépose un fichier ci-dessus.",
  },
  classNotebookLauncherHeading: { es: "Cuaderno de clase", ja: "授業ノート", fr: "Cahier de classe" },
  classNotebookLauncherIntro: {
    es: "Abre un cuaderno para tomar apuntes durante una clase — escribe libremente, página a página, y ordena lo útil en Gramática o Vocabulario más tarde.",
    ja: "授業中にノートを取るためのノートブックを開きましょう — ページごとに自由に書いて、あとで役立つ内容を文法や単語に整理できます。",
    fr: "Ouvre un cahier pour prendre des notes pendant un cours — écris librement, page par page, et trie ce qui est utile dans Grammaire ou Vocabulaire plus tard.",
  },
  openClassNotebookButton: { es: "Abrir Cuaderno de clase", ja: "授業ノートを開く", fr: "Ouvrir le Cahier de classe" },
  classNotebookHeading: { es: "Cuaderno de clase", ja: "授業ノート", fr: "Cahier de classe" },
  classNotebookPlaceholder: { es: "Empieza a escribir…", ja: "書き始めましょう…", fr: "Commence à écrire…" },
  notebookPrevPage: { es: "← Página anterior", ja: "← 前のページ", fr: "← Page précédente" },
  notebookNextPage: { es: "Página siguiente →", ja: "次のページ →", fr: "Page suivante →" },

  // ---- Language home bubble descriptions ----
  subVocab: { es: "Temas, palabras, conjugación de verbos, tarjetas", ja: "テーマ、単語、動詞の活用、単語カード", fr: "Thèmes, mots, conjugaison, cartes mémo" },
  subGrammar: { es: "Tus propias notas sobre estructuras y patrones", ja: "文の構造やパターンに関する自分のメモ", fr: "Tes propres notes sur les structures et les tournures" },
  subWriting: { es: "Entradas tipo diario con fecha, vinculadas a un texto de referencia", ja: "日付付きの日記形式のエントリー、参照用の文章にリンク", fr: "Entrées façon journal datées, liées à un texte de référence" },
  subPersonalHub: { es: "Casillero de almacenamiento, notas, listas de tareas, lo que sea", ja: "保管庫、メモ、やることリスト、何でも", fr: "Casier de stockage, notes, listes de tâches, n'importe quoi" },
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
  viewVocabTitle: { es: "Ver vocabulario", ja: "単語を見る", fr: "Voir le vocabulaire" },
  viewVocabSub: { es: "Ve todo lo que ya has guardado en este tema", ja: "このテーマに保存済みの単語をすべて見る", fr: "Voir tout ce qui est déjà enregistré dans ce thème" },
  viewVocabHeading: { es: "Ver vocabulario", ja: "単語を見る", fr: "Voir le vocabulaire" },
  sortByLabel: { es: "Ordenar por", ja: "並べ替え", fr: "Trier par" },
  sortNewestOption: { es: "Más nuevo primero", ja: "新しい順", fr: "Plus récent d'abord" },
  sortTargetAzOption: { es: "A–Z (idioma de destino)", ja: "A–Z（対象言語）", fr: "A–Z (langue cible)" },
  sortEnglishAzOption: { es: "A–Z (inglés)", ja: "A–Z（英語）", fr: "A–Z (anglais)" },
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
  mistakesCardTitle: { es: "Errores", ja: "間違い", fr: "Erreurs" },
  filterAllChip: { es: "Todo", ja: "すべて", fr: "Tout" },
  noNotesWithTagText: { es: "No hay notas con esta etiqueta.", ja: "このタグのメモはありません。", fr: "Aucune note avec cette étiquette." },
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
  dragDropImageHint: { es: "Arrastra y suelta una imagen aquí", ja: "ここに画像をドラッグ＆ドロップ", fr: "Glisse-dépose une image ici" },
  chooseFileLabel: { es: "Elegir archivo", ja: "ファイルを選択", fr: "Choisir un fichier" },
  savedPassagesButton: { es: "Textos guardados", ja: "保存した文章", fr: "Textes enregistrés" },
  backToReading: { es: "Volver a Lectura", ja: "リーディングに戻る", fr: "Retour à Lecture" },
  savedPassagesHeading: { es: "Textos guardados", ja: "保存した文章", fr: "Textes enregistrés" },
  noSavedPassagesYetText: { es: "Aún no hay textos guardados.", ja: "まだ保存した文章はありません。", fr: "Aucun texte enregistré pour l'instant." },
  tryClaudeReaderButton: { es: "Probar el lector más preciso de Claude", ja: "Claudeのより正確なリーダーを試す", fr: "Essayer le lecteur plus précis de Claude" },
  saveStartReadingButton: { es: "Guardar y empezar a leer", ja: "保存して読み始める", fr: "Enregistrer et commencer à lire" },
  grammarNotesPrefix: { es: "Notas de gramática (", ja: "文法メモ（", fr: "Notes de grammaire (" },
  grammarNotesHeading: { es: "Notas de gramática", ja: "文法メモ", fr: "Notes de grammaire" },
  savedFromPassageHeading: { es: "Guardado desde este texto", ja: "この文章から保存", fr: "Enregistré depuis ce texte" },
  vocabNotesPrefix: { es: "Vocabulario guardado (", ja: "保存した単語（", fr: "Vocabulaire enregistré (" },
  vocabNotesHeading: { es: "Vocabulario guardado", ja: "保存した単語", fr: "Vocabulaire enregistré" },
  vocabHeading: { es: "Vocabulario", ja: "単語", fr: "Vocabulaire" },
  vocabNotesLocateHint: { es: "Haz clic en una palabra para ir a donde aparece en el texto.", ja: "単語をクリックすると本文中の位置に移動します。", fr: "Clique sur un mot pour aller à l'endroit où il apparaît dans le texte." },
  noVocabSavedFromPassageText: { es: "Todavía no se ha guardado vocabulario desde este texto.", ja: "この文章からまだ単語が保存されていません。", fr: "Aucun vocabulaire enregistré depuis ce texte pour l'instant." },
  showFuriganaReviewButton: { es: "Mostrar furigana de las palabras buscadas", ja: "調べた単語のふりがなを表示", fr: "Afficher le furigana des mots recherchés" },
  showOriginalPassageButton: { es: "Mostrar texto original", ja: "元の文章を表示", fr: "Afficher le texte original" },
  openInVocabBankLink: { es: "Abrir en el Banco de vocabulario", ja: "単語帳で開く", fr: "Ouvrir dans la Banque de vocabulaire" },
  wordKanjiLabel: { es: "Palabra / kanji", ja: "単語・漢字", fr: "Mot / kanji" },
  furiganaLabel: { es: "Furigana", ja: "ふりがな", fr: "Furigana" },
  meaningLabel: { es: "Significado", ja: "意味", fr: "Signification" },
  themeLabel: { es: "Tema", ja: "テーマ", fr: "Thème" },
  infinitiveLabel: { es: "Infinitivo / forma de diccionario (opcional)", ja: "辞書形（任意）", fr: "Infinitif / forme du dictionnaire (facultatif)" },
  generateExamplesButton: { es: "✨ Generar 3 ejemplos", ja: "✨ 例文を3つ生成", fr: "✨ Générer 3 exemples" },
  generatingExamplesStatus: { es: "Generando…", ja: "生成中…", fr: "Génération en cours…" },
  generateExamplesFailedHint: { es: "No se pudieron generar ejemplos. Inténtalo de nuevo.", ja: "例文を生成できませんでした。もう一度お試しください。", fr: "Impossible de générer des exemples. Réessaie." },
  seeHiraganaButton: { es: "Ver hiragana", ja: "ひらがなを見る", fr: "Voir le hiragana" },
  hideHiraganaButton: { es: "Ocultar hiragana", ja: "ひらがなを隠す", fr: "Masquer le hiragana" },
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
  allChangesSavedStatus: { es: "Todos los cambios guardados", ja: "すべての変更が保存されました", fr: "Toutes les modifications sont enregistrées" },
  unsavedChangesStatus: { es: "Cambios sin guardar…", ja: "未保存の変更…", fr: "Modifications non enregistrées…" },
  addToVocabButton: { es: "Añadir al vocabulario", ja: "単語帳に追加", fr: "Ajouter au vocabulaire" },
  addNotePlusButton: { es: "+ Nota", ja: "+ メモ", fr: "+ Note" },
  editNoteButton: { es: "Editar nota", ja: "メモを編集", fr: "Modifier la note" },
  addToGrammarButton: { es: "Añadir a Gramática", ja: "文法に追加", fr: "Ajouter à Grammaire" },
  untitledEntryText: { es: "Entrada sin título", ja: "無題のエントリー", fr: "Entrée sans titre" },
  newEntryHeadingTemplate: { es: "Nueva entrada en {lang}", ja: "新しい{lang}のエントリー", fr: "Nouvelle entrée en {lang}" },
  noWritingYetText: { es: "Todavía no hay escritura — haz clic en Editar para añadir algo.", ja: "まだ文章がありません — 「編集」をクリックして書き始めてください。", fr: "Pas encore de texte — clique sur Modifier pour en ajouter." },
  linkedBadgePrefix: { es: "Enlazado: {title}", ja: "リンク済み：{title}", fr: "Lié : {title}" },
  noUnknownWordsCountText: { es: "Todavía no hay palabras desconocidas en esta entrada.", ja: "このエントリーにはまだ未知の単語がありません。", fr: "Pas encore de mots inconnus dans cette entrée." },
  oneUnknownWordCountText: { es: "1 palabra desconocida en esta entrada.", ja: "このエントリーには未知の単語が1つあります。", fr: "1 mot inconnu dans cette entrée." },
  unknownWordsCountText: { es: "{n} palabras desconocidas en esta entrada.", ja: "このエントリーには未知の単語が{n}個あります。", fr: "{n} mots inconnus dans cette entrée." },
  noUnknownWordsHelperHint: { es: "Todavía no hay palabras desconocidas — encierra una como <word> en tu escrito.", ja: "まだ未知の単語はありません — 文章の中で<word>のように山括弧で囲んでください。", fr: "Pas encore de mot inconnu — mets-en un entre chevrons comme <word> dans ton texte." },
  notCheckedYetHint: { es: "aún no revisado", ja: "まだチェックされていません", fr: "pas encore vérifié" },
  addedToVocabDefaultText: { es: "✓ Añadido al vocabulario", ja: "✓ 単語帳に追加済み", fr: "✓ Ajouté au vocabulaire" },
  addedToVocabWithThemeText: { es: "✓ Añadido a — {theme}", ja: "✓ 追加済み — {theme}", fr: "✓ Ajouté à — {theme}" },
  helperNoteQuestionPlaceholder: { es: "Una pregunta o nota sobre esta palabra (por qué esta forma, cuándo usarla, etc.)", ja: "この単語についての質問やメモ（なぜこの形か、いつ使うか、など）", fr: "Une question ou une note sur ce mot (pourquoi cette forme, quand l'utiliser, etc.)" },
  giveEntryTitleAlert: { es: "Ponle un título a la entrada.", ja: "エントリーにタイトルを付けてください。", fr: "Donne un titre à l'entrée." },
  createNewThemeNamePrompt: { es: "Nombre del nuevo tema:", ja: "新しいテーマの名前：", fr: "Nom du nouveau thème :" },
  giveWordBeforeSavingAlert: { es: "Escribe una palabra en {lang} antes de guardar.", ja: "保存する前に{lang}の単語を入力してください。", fr: "Indique un mot en {lang} avant d'enregistrer." },
  wordAlreadyExistsAlert: { es: "Esa palabra ya existe en ese tema — elige otro tema, o ya está cubierta.", ja: "その単語はそのテーマにすでに存在します — 別のテーマを選ぶか、すでに登録済みです。", fr: "Ce mot existe déjà dans ce thème — choisis un autre thème, ou il est déjà couvert." },
  removeHelperWordConfirm: { es: "¿Eliminar esto de tu Cuaderno de ayuda? Esto no afecta nada que ya esté guardado en tu Banco de vocabulario.", ja: "これをヘルパーノートから削除しますか？すでに単語帳に保存されているものには影響しません。", fr: "Retirer ceci de ton Cahier d'aide ? Cela ne touche pas ce qui est déjà enregistré dans ta Banque de vocabulaire." },
  saveEntryFirstVocabAlert: { es: "Guarda la entrada primero, luego ejecuta la revisión de vocabulario.", ja: "先にエントリーを保存してから、語彙チェックを実行してください。", fr: "Enregistre d'abord l'entrée, puis lance la vérification de vocabulaire." },
  saveEntryFirstGrammarAlert: { es: "Guarda la entrada primero, luego ejecuta la revisión de gramática.", ja: "先にエントリーを保存してから、文法チェックを実行してください。", fr: "Enregistre d'abord l'entrée, puis lance la vérification de grammaire." },
  noWordsToCheckAlert: { es: "No quedan palabras entre < > por revisar.", ja: "チェックする<>の単語が残っていません。", fr: "Il ne reste aucun mot entre < > à vérifier." },
  checkingVocabStatus: { es: "Revisando...", ja: "チェック中…", fr: "Vérification..." },
  couldntFindTranslationStatus: { es: "No se encontró traducción para: {words} — se dejó tal cual, inténtalo de nuevo más tarde.", ja: "次の単語の翻訳が見つかりませんでした：{words} — そのままにしてあります。後でもう一度試してください。", fr: "Traduction introuvable pour : {words} — laissé tel quel, réessaie plus tard." },
  nothingToCheckAlert: { es: "Todavía no hay nada que revisar — escribe algo primero.", ja: "まだチェックするものがありません — まず何か書いてください。", fr: "Rien à vérifier pour l'instant — écris d'abord quelque chose." },
  checkingGrammarStatus: { es: "Revisando gramática...", ja: "文法をチェック中…", fr: "Vérification de la grammaire..." },
  grammarCheckFailedStatus: { es: "La revisión de gramática falló: {error}", ja: "文法チェックに失敗しました：{error}", fr: "Échec de la vérification de grammaire : {error}" },
  grammarCheckFailedFallback: { es: "el servidor no devolvió un resultado utilizable.", ja: "サーバーから使用可能な結果が返されませんでした。", fr: "le serveur n'a pas renvoyé de résultat utilisable." },
  noGrammarIssuesStatus: { es: "No se encontraron problemas de gramática — ¡se ve bien!", ja: "文法の問題は見つかりませんでした — いい感じです！", fr: "Aucun problème de grammaire trouvé — c'est bon !" },
  addedToGrammarDefaultText: { es: "✓ Añadido a Gramática", ja: "✓ 文法に追加済み", fr: "✓ Ajouté à Grammaire" },
  recognizedPatternHint: { es: "Patrón reconocido: {label} — se sugirió una carpeta correspondiente abajo para que puedas practicarlo más tarde.", ja: "認識されたパターン：{label} — 後で練習できるように、下に該当するフォルダを提案しました。", fr: "Schéma reconnu : {label} — un dossier correspondant est suggéré ci-dessous pour que tu puisses t'entraîner plus tard." },
  deleteEntryConfirm: { es: "¿Eliminar esta entrada? No se puede deshacer.", ja: "このエントリーを削除しますか？元に戻せません。", fr: "Supprimer cette entrée ? Cette action est irréversible." },
  targetWordPlaceholderTemplate: { es: "palabra en {lang}", ja: "{lang}の単語", fr: "mot en {lang}" },
  createNewGrammarFolderPrompt: { es: "Nombre de la nueva carpeta de Gramática:", ja: "新しい文法フォルダの名前：", fr: "Nom du nouveau dossier de Grammaire :" },
  noMorePassagesAlert: { es: "No hay más textos para abrir — guarda uno desde la sección de Lectura primero, o ya están abiertos todos los textos en este idioma.", ja: "これ以上開ける文章がありません — まずリーディングのセクションで文章を保存するか、この言語のすべての文章がすでに開かれています。", fr: "Il n'y a plus de texte à ouvrir — enregistre-en un depuis la section Lecture, ou tous les textes de cette langue sont déjà ouverts." },

  // ---- Vocab app dynamic UI ----
  extractingStatus: { es: "Extrayendo...", ja: "抽出中…", fr: "Extraction..." },
  deleteThemeButton: { es: "Eliminar tema", ja: "テーマを削除", fr: "Supprimer le thème" },
  noWordsYetText: { es: "Todavía no hay palabras — añade una arriba.", ja: "まだ単語がありません — 上で追加してください。", fr: "Pas encore de mots — ajoutes-en un ci-dessus." },
  moveCopyButton: { es: "Mover/Copiar", ja: "移動／コピー", fr: "Déplacer/Copier" },
  moveButton: { es: "Mover", ja: "移動", fr: "Déplacer" },
  copyButton: { es: "Copiar", ja: "コピー", fr: "Copier" },
  moveSelectedButton: { es: "Mover selección", ja: "選択したものを移動", fr: "Déplacer la sélection" },
  copySelectedButton: { es: "Copiar selección", ja: "選択したものをコピー", fr: "Copier la sélection" },
  addThemeWithWordsFirstText: { es: "Primero añade un tema con algunas palabras.", ja: "まず単語のあるテーマを追加してください。", fr: "Ajoute d'abord un thème avec quelques mots." },

  // ---- Main Hub dynamic UI ----
  noBubblesYetText: { es: "Todavía no hay burbujas — añade una arriba.", ja: "まだバブルがありません — 上で追加してください。", fr: "Pas encore de bulles — ajoutes-en une ci-dessus." },

  // ---- Main Hub tiles (new 3-tile landing page) ----
  mainHubTitle: { es: "Todo lo que no es un simulacro", ja: "これは訓練ではない、すべて", fr: "Tout ce qui n'est pas un exercice" },
  makeYourOwnBubbleHeading: { es: "Crea tu propia burbuja", ja: "自分のバブルを作る", fr: "Crée ta propre bulle" },
  mainHubNotebookDesc: { es: "Notas de clase, escritas a mano sobre la marcha.", ja: "授業のメモを、その場で手書きで。", fr: "Notes de cours, écrites à la main au fur et à mesure." },
  mainHubStorageDesc: { es: "Documentos y archivos guardados de clase.", ja: "授業で配られた資料やファイル。", fr: "Documents et fichiers conservés du cours." },
  mainHubBubbleDesc: { es: "Notas sueltas, fijadas donde quieras.", ja: "自由なメモを、好きな場所に。", fr: "Notes libres, épinglées où tu veux." },

  // ---- "How to use" help modal (Personal Hub / Writing / Grammar / Vocab / Reading) ----
  howtoButton: { es: "Cómo usarlo", ja: "使い方", fr: "Comment l'utiliser" },
  howtoModalTitle: { es: "Cómo usar esta página", ja: "このページの使い方", fr: "Comment utiliser cette page" },

  howtoBodyPersonalHub1: { es: "Este es un espacio general para ti, con un cuaderno de clase y un armario de almacenamiento.", ja: "ここはあなたのための一般的なスペースで、クラスノートと保管ロッカーがあります。", fr: "C'est un espace général pour toi, avec un cahier de classe et un casier de stockage." },
  howtoBodyPersonalHub2: { es: "El cuaderno de clase es un cuaderno online para lecciones y notas generales. Cualquier cosa importante que escribas se puede añadir a cualquier sección — nuevas reglas de gramática o vocabulario, por ejemplo — y aparecerá una opción para guardar una nota cada vez que estés en Gramática o Vocabulario.", ja: "クラスノートは、一般的なレッスンやメモのためのオンラインノートです。書いた大切な内容は、新しい文法ルールや単語など、どのセクションにも追加できます。文法や単語のページを使っているときには、メモを保存するオプションが表示されます。", fr: "Le cahier de classe est un cahier en ligne pour les leçons et notes générales. Tout ce que tu écris d'important peut être ajouté à n'importe quelle section — de nouvelles règles de grammaire ou du vocabulaire, par exemple — et une option pour enregistrer une note apparaîtra chaque fois que tu es dans Grammaire ou Vocabulaire." },
  howtoBodyPersonalHub3: { es: "El armario de almacenamiento sirve para guardar PDFs o cualquier otro material puntual. Se puede abrir en cualquier momento.", ja: "保管ロッカーは、PDFやその他の資料を保存しておくためのものです。いつでも開くことができます。", fr: "Le casier de stockage sert à enregistrer des PDF ou tout autre document ponctuel. Il peut être ouvert à tout moment." },

  howtoBodyWriting1: { es: "Escribir un blog en tu idioma meta es una de las formas más útiles, y más pasadas por alto, de ganar fluidez. Crear tus propias frases, de forma constante, ayuda muchísimo a tu manera de hablar — y de paso vas aprendiendo vocabulario del día a día.", ja: "学習中の言語でブログを書くことは、流暢さを伸ばす方法の中でもとても効果的なのに見落とされがちな方法です。自分の文を継続的に作ることは話す力に大きく役立ち、そのついでに日常の単語も自然に身につきます。", fr: "Tenir un blog dans ta langue cible est l'un des moyens les plus utiles, mais les plus négligés, pour gagner en aisance. Créer tes propres phrases, régulièrement, aide énormément ton expression orale — et tu apprends du vocabulaire du quotidien au passage." },
  howtoBodyWriting2: { es: "Las revisiones de vocabulario y de gramática las hace la IA. Las de vocabulario se basan en un diccionario, aunque también se anima a usar tus propias notas personales. Las revisiones de gramática están disponibles pero deben usarse con cautela — los matices y la naturalidad de un idioma son cosas que enseña mejor un hablante nativo, así que no conviene depender demasiado de ellas.", ja: "単語チェックと文法チェックはどちらもAIが行います。単語チェックは辞書を参照して行われますが、自分自身のメモを活用することもおすすめです。文法チェックも利用できますが、注意して使ってください — 言語のニュアンスや自然な話し方はネイティブスピーカーから学ぶのが一番なので、頼りすぎないようにしましょう。", fr: "Les vérifications de vocabulaire et de grammaire sont toutes deux faites par l'IA. Celles de vocabulaire s'appuient sur un dictionnaire, même si tes propres notes personnelles sont aussi encouragées. Les vérifications de grammaire sont disponibles mais à utiliser avec prudence — les nuances et le naturel d'une langue s'apprennent mieux auprès d'un locuteur natif, donc mieux vaut ne pas trop s'y fier." },
  howtoBodyWriting3: { es: "También hay muchas funciones de organización integradas: revisiones de vocabulario después de escribir, textos de referencia que puedes consultar junto a tu entrada, notas personales y una casilla de notas para el profesor, y errores que se pueden guardar y trasladar a Vocabulario para practicarlos más tarde.", ja: "整理のための機能もたくさん用意されています。書いた後の単語チェック、エントリーの横に呼び出せる参考文章、個人メモや先生へのメモ欄、そして間違いを保存して後で単語セクションに移し、テストできる機能などです。", fr: "De nombreuses fonctionnalités d'organisation sont aussi intégrées : vérifications de vocabulaire après l'écriture, textes de référence que tu peux consulter à côté de ton entrée, notes personnelles et un encadré de notes pour le professeur, ainsi que des erreurs que tu peux enregistrer et déplacer vers Vocabulaire pour t'entraîner plus tard." },

  howtoBodyGrammar1: { es: "En algún momento hace falta un libro de texto para aprender las bases de la gramática. La fluidez se construye con la repetición, pero antes de coger el tacto del idioma, hace falta cierto marco.", ja: "文法の基礎を学ぶには、どこかの時点で教科書が必要になります。流暢さは反復によって身につきますが、言語の感覚をつかむ前には、ある程度の枠組みが必要です。", fr: "À un moment donné, un manuel est nécessaire pour apprendre les bases de la grammaire. L'aisance se construit par la répétition, mais avant de prendre le rythme de la langue, un minimum de cadre est nécessaire." },
  howtoBodyGrammar2: { es: "Ya se dan algunos ejemplos, pero te animamos a crear tus propias notas para puntos de gramática concretos. Cuando un punto de gramática aparece con suficiente frecuencia para que la IA lo reconozca, se puede generar un test para practicar más.", ja: "いくつかの例はすでに用意されていますが、個々の文法ポイントについて自分で自由にノートを作ることも歓迎されます。ある文法ポイントがAIに認識されるほど頻繁に出てくる場合は、追加練習用のテストを生成できます。", fr: "Quelques exemples sont déjà fournis, mais tu es encouragé(e) à créer tes propres notes pour des points de grammaire distincts. Quand un point de grammaire revient assez souvent pour être détecté par l'IA, un test peut être généré pour t'entraîner davantage." },

  howtoBodyVocab1: { es: "La típica práctica de tarjetas de vocabulario. Es una excelente manera de empezar una sesión de idioma — refresca la memoria con algo de vocabulario primero. Recuerda: la fluidez se construye con la repetición.", ja: "定番の単語フラッシュカード練習です。言語学習セッションを始めるのにぴったりの方法です — まず単語で記憶をリフレッシュしましょう。流暢さは反復によって身につくことを忘れずに。", fr: "Le classique entraînement aux cartes de vocabulaire. C'est une excellente façon de commencer une session de langue — rafraîchis-toi d'abord la mémoire avec du vocabulaire. N'oublie pas : l'aisance se construit par la répétition." },

  howtoBodyReading1: { es: "La forma más natural de aprender un idioma — captando expresiones cotidianas, matices y jerga — es leyendo noticias, publicaciones de blogs y otros contenidos en tu idioma meta.", ja: "言語を自然に学ぶ一番の方法は、学習中の言語でニュースやブログ記事、その他のメディアを読むことです — 日常的な表現やニュアンス、スラングが自然に身につきます。", fr: "La façon la plus naturelle d'apprendre une langue — en captant des expressions courantes, des nuances et de l'argot — est de lire des actualités, des articles de blog et d'autres contenus dans ta langue cible." },
  howtoBodyReading2: { es: "Copia y pega un texto, o sube una captura de pantalla, y léelo con normalidad. Cuando aparezca una palabra o frase nueva, simplemente selecciónala para ver su significado y guardarla directamente en tu banco de vocabulario para practicarla más tarde.", ja: "テキストをコピー＆ペーストするか、スクリーンショットをアップロードして、普通に読み進めてください。新しい単語やフレーズが出てきたら、それをハイライトするだけで意味が表示され、そのまま単語バンクに保存して後でテストできます。", fr: "Copie-colle un texte, ou téléverse une capture d'écran, puis lis normalement. Quand un mot ou une expression nouvelle apparaît, il suffit de le surligner pour voir sa signification et l'enregistrer directement dans ta banque de vocabulaire pour t'entraîner plus tard." },
  howtoBodyReading3: { es: "Ojo — si una palabra o frase que seleccionas ya está guardada en tu banco de vocabulario, se marcará para que le des una vuelta extra. ¡Esta ya te la sabes!", ja: "注意 — ハイライトした単語やフレーズがすでに単語バンクに保存されている場合は、もう一度よく考えるようにフラグが表示されます。これは知っているはずですよ！", fr: "Attention — si un mot ou une expression que tu surlignes est déjà enregistré dans ta banque de vocabulaire, il sera signalé pour que tu y réfléchisses un peu plus. Celui-là, tu le connais déjà !" },

  // ---- Storage Locker (dedicated page) ----
  addDocumentButton: { es: "+ Añadir documento", ja: "+ 資料を追加", fr: "+ Ajouter un document" },
  lockerTitlePlaceholder: { es: "Título", ja: "タイトル", fr: "Titre" },
  lockerUrlPlaceholder: { es: "https://…", ja: "https://…", fr: "https://…" },
  lockerNotePlaceholder: { es: "Nota (opcional)", ja: "メモ（任意）", fr: "Note (optionnel)" },
  lockerSave: { es: "Guardar", ja: "保存", fr: "Enregistrer" },
  lockerCancel: { es: "Cancelar", ja: "キャンセル", fr: "Annuler" },
  lockerLinksHeading: { es: "Enlaces", ja: "リンク", fr: "Liens" },
  lockerDocumentsHeading: { es: "Documentos", ja: "資料", fr: "Documents" },
  lockerSearchLinks: { es: "Buscar enlaces…", ja: "リンクを検索…", fr: "Rechercher des liens…" },
  lockerSearchDocuments: { es: "Buscar documentos…", ja: "資料を検索…", fr: "Rechercher des documents…" },

  // ---- Bubbles (dedicated page) ----
  bubblesHeading: { es: "Tus burbujas", ja: "あなたのバブル", fr: "Tes bulles" },
  newBubbleButton: { es: "+ Nueva burbuja", ja: "+ 新しいバブル", fr: "+ Nouvelle bulle" },

  // ---- Class Notebook toolbar ----
  notebookBoldButton: { es: "Negrita", ja: "太字", fr: "Gras" },
  notebookUnderlineButton: { es: "Subrayado", ja: "下線", fr: "Souligné" },
  notebookHighlightButton: { es: "Resaltar", ja: "ハイライト", fr: "Surligner" },
  notebookNewVocabButton: { es: "+ Nuevo vocabulario", ja: "+ 新しい単語", fr: "+ Nouveau vocabulaire" },
  notebookNewGrammarButton: { es: "+ Nueva gramática", ja: "+ 新しい文法", fr: "+ Nouvelle grammaire" },
  addTextButton: { es: "+ Añadir texto", ja: "＋ テキストを追加", fr: "+ Ajouter un texte" },
  newestFirstLabel: { es: "Más recientes primero", ja: "新しい順", fr: "Plus récents d'abord" },
  continueReadingButton: { es: "Continuar", ja: "続きから", fr: "Continuer" },
  reReadButton: { es: "Releer", ja: "再読", fr: "Relire" },
  readButton: { es: "Leer", ja: "読む", fr: "Lire" },
  notStartedStatus: { es: "Sin empezar", ja: "未読", fr: "Non commencé" },
  finishedStatus: { es: "Terminado", ja: "読了", fr: "Terminé" },
  addRandomVocabButton: { es: "+ Añadir vocab. suelto", ja: "＋ ランダムな単語を追加", fr: "+ Ajouter du vocab. divers" },
  addRandomVocabHeading: { es: "Añadir vocabulario suelto", ja: "ランダムな単語を追加", fr: "Ajouter du vocabulaire divers" },
  randomVocabHint: {
    es: "Pega cualquier lista de palabras/frases que no pertenezca a un solo tema — fuentes mixtas, hallazgos sueltos, lo que se haya acumulado. Extráela y luego usa el menú desplegable junto a cada una para archivarla en un tema existente o uno nuevo antes de guardar.",
    ja: "一つのテーマに属さない単語やフレーズのリストを貼り付けてください — 出所が混在していたり、たまったものなど何でも構いません。抽出したら、それぞれの項目の横にあるプルダウンで、保存前に既存のテーマか新しいテーマに振り分けられます。",
    fr: "Colle n'importe quelle liste de mots/expressions qui n'appartient pas à un seul thème — sources mélangées, trouvailles diverses, ce qui s'est accumulé. Extrais-la, puis utilise le menu déroulant à côté de chaque élément pour le classer dans un thème existant ou un nouveau avant d'enregistrer.",
  },
  assignToThemeHint: { es: "El último menú de cada fila es el tema en el que se guardará.", ja: "各行の最後のプルダウンが保存先のテーマです。", fr: "Le dernier menu de chaque ligne est le thème dans lequel l'élément sera enregistré." },
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
  // A handful of elements carry dynamic content (a count, a name, a
  // server error) baked into their English text — those set
  // data-immersion-vars (JSON) alongside data-immersion-key so the
  // {token} placeholders in the dictionary string can be swapped back
  // in after translation, e.g. {n} unknown words / Linked: {title}.
  let value = entry[lang];
  if (el.dataset.immersionVars) {
    try {
      const vars = JSON.parse(el.dataset.immersionVars);
      Object.keys(vars).forEach((k) => {
        value = value.split(`{${k}}`).join(vars[k]);
      });
    } catch (e) {
      /* malformed vars — fall back to the untouched template */
    }
  }
  writeAttr(el, attr, value);
  if (attr === "textContent") el.classList.add("immersion-text");
}

// For text a page's own JS rebuilds in place on an element that
// already existed at load (a word count, an autosave status, a badge)
// rather than a freshly-created/appended node — the MutationObserver
// above only fires on new nodes, so after setting the new English
// text + data-immersion-key (+ data-immersion-vars for a templated
// string), call this once to translate that one element immediately
// if immersion is currently on. Safe to call unconditionally; it's a
// no-op when immersion is off (the English text just set stays put).
function retranslateImmersionElement(el) {
  if (!el || !el.dataset.immersionKey) return;
  delete el.dataset.immersionOriginal; // recapture the English text just set
  const lang = document.body.dataset.immersionLang;
  if (lang) setImmersionText(el, el.dataset.immersionKey, lang);
}

// For one-off dynamic text that isn't attached to a persistent element
// at all — an alert()/confirm()/prompt() message, or a string being
// assembled before it's ever put in the DOM. Returns the current
// target-language string (with {token} substitution) when immersion is
// on and the dictionary has it, otherwise the English fallback passed
// in — so call sites read naturally even before any translation work
// is added for a given key.
function t(stringKey, fallbackEnglish, vars) {
  const lang = document.body.dataset.immersionLang;
  const entry = lang && IMMERSION_STRINGS[stringKey];
  if (!entry || !entry[lang]) return fallbackEnglish;
  let value = entry[lang];
  if (vars) Object.keys(vars).forEach((k) => { value = value.split(`{${k}}`).join(vars[k]); });
  return value;
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
  module.exports = {
    initImmersion,
    applyImmersion,
    isImmersionEnabled,
    setImmersionEnabled,
    IMMERSION_STRINGS,
    t,
    retranslateImmersionElement,
  };
} else {
  window.initImmersion = initImmersion;
  window.t = t;
  window.retranslateImmersionElement = retranslateImmersionElement;
}
