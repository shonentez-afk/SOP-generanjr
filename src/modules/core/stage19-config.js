
'use strict';
// ============================================================
// 1. CONFIG — сохраняем существующую связь с Yandex Cloud proxy
// ============================================================
const AI_PROXY_BASE='https://functions.yandexcloud.net/d4ehdpoue3sve6s0f92b';
const AI_DEFAULT_MODEL='yandexgpt-lite';
const YANDEX_MODELS=[
 {id:'yandexgpt-lite',name:'⚡ YandexGPT Lite — быстрая, экономичная'},
 {id:'yandexgpt',name:'🧠 YandexGPT — полная модель'},
 {id:'yandexgpt-5',name:'🚀 YandexGPT 5 — флагманская'}
];
const APP_VERSION='3.3.0';
const DRAFT_KEY='sop-builder-draft-v3';
const LEGACY_DRAFT_KEYS=['sop-builder-draft-v2','sop-builder-draft-v1'];
const DRAFT_VERSION=4;
const DOC_DB_NAME='sop-document-manager-db-v1',DOC_DB_VERSION=2,DOC_STORE='documents',DOC_META_STORE='meta';
const IDB_NAME='sop-builder-db-v3',IDB_VERSION=1,IDB_STORE='stepPhotos';
const LEGACY_IDB_NAMES=['sop-builder-db-v2','sop-builder-db'];
const AI_TIMEOUT_MS=45000;
const DISCLAIMER='В случае обнаружения какой-либо неисправности (несоответствия), нарушающей нормальный (безопасный) режим работы, ее необходимо остановить. Обо всех замеченных недостатках поставить в известность ответственного руководителя работ. Работы, не входящие в СОП-Технологическую карту, выполняются сотрудником, которого назначает ответственный руководитель работ, после подготовки рабочего места (при необходимости), с учетом выполнения всех требований безопасности. Все работы выполняются в соответствии с требованиями разработанных и утверждённых в организации инструкций по охране труда.';
const ICON_LIB=[
['M001','mandatory','Общее предписание'],['M002','mandatory','Изучить инструкцию по эксплуатации'],['M003','mandatory','Защита органов слуха'],['M004','mandatory','Защита глаз'],['M006','mandatory','Отключить вилку от розетки'],['M008','mandatory','Защитная обувь'],['M009','mandatory','Защитные перчатки'],['M010','mandatory','Спецодежда'],['M011','mandatory','Мыть руки'],['M013','mandatory','Защитный щиток для лица'],['M014','mandatory','Защита головы (каска)'],['M015','mandatory','Сигнальная одежда'],['M016','mandatory','Маска'],['M017','mandatory','Средства защиты органов дыхания'],['M018','mandatory','Страховочная привязь (работа на высоте)'],['M019','mandatory','Сварочная маска'],['M021','mandatory','Отключить перед обслуживанием'],['M026','mandatory','Защитный фартук'],['M056','mandatory','Проветрить перед входом и во время работы'],['M068','mandatory','Заблокировать движущиеся части'],['W001','warning','Общая опасность'],['W002','warning','Взрывоопасные материалы'],['W008','warning','Опасность падения с высоты'],['W010','warning','Низкая температура / обморожение'],['W011','warning','Скользкая поверхность'],['W012','warning','Опасность поражения током'],['W014','warning','Погрузчики и промышленный транспорт'],['W015','warning','Груз над головой (кран)'],['W016','warning','Токсичные вещества'],['W017','warning','Горячая поверхность'],['W018','warning','Автоматический запуск оборудования'],['W019','warning','Опасность зажатия'],['W021','warning','Легковоспламеняющиеся материалы'],['W022','warning','Острые кромки / порезы'],['W023','warning','Едкие / коррозионные вещества'],['W025','warning','Вращающиеся ролики'],['W026','warning','Зарядка аккумуляторов'],['W028','warning','Окисляющие вещества'],['W029','warning','Баллоны под давлением'],['W035','warning','Падающие предметы'],['W079','warning','Горячее содержимое'],['W080','warning','Горячий пар'],['W087','warning','Высокий уровень шума'],['P001','prohibition','Общий запрет'],['P002','prohibition','Курение запрещено'],['P003','prohibition','Открытый огонь запрещён'],['P004','prohibition','Проход запрещён'],['P008','prohibition','Металлические предметы и часы запрещены'],['P009','prohibition','Взбираться запрещено'],['P010','prohibition','Не прикасаться'],['P011','prohibition','Не тушить водой'],['P013','prohibition','Мобильные телефоны запрещены'],['P015','prohibition','Не просовывать руки'],['P019','prohibition','Не наступать на поверхность'],['P022','prohibition','Есть и пить запрещено'],['P024','prohibition','Не стоять и не ходить здесь'],['P028','prohibition','Работать без перчаток (вращающиеся части)'],['P031','prohibition','Не менять положение переключателя'],['P039','prohibition','Огневые работы запрещены'],['P080','prohibition','Посторонним вход воспрещён']
].map(([id,type,label])=>({id,type,label}));
const ICON_TYPE_META={mandatory:{title:'Предписывающие',ring:'border-blue-400 bg-blue-50'},warning:{title:'Предупреждающие',ring:'border-amber-400 bg-amber-50'},prohibition:{title:'Запрещающие',ring:'border-red-400 bg-red-50'}};
const CHECKLIST_DEFAULT=[
{id:1,req:'Безопасность: Указаны СИЗ, опасные условия труда',score:.3,weight:1,comment:'',scoreSource:'seed'},
{id:2,req:'Описаны инструменты и приспособления (подготовка к операции)',score:0,weight:1,comment:'',scoreSource:'seed'},
{id:3,req:'Указаны исполнители и их количество',score:1,weight:.5,comment:'',scoreSource:'seed'},
{id:4,req:'Чётко и ясно описаны действия (что делать?) хода процедуры',score:.3,weight:1,comment:'',scoreSource:'seed'},
{id:5,req:'Действия визуализированы наиболее удачно (фото или схема)',score:.7,weight:.5,comment:'',scoreSource:'seed'},
{id:6,req:'Для каждого действия/операции выделены ключевые моменты (КМ) (как делать?)',score:.7,weight:1,comment:'',scoreSource:'seed'},
{id:7,req:'В каждом действии выделены причины КМ (почему именно так делать?)',score:.7,weight:1,comment:'',scoreSource:'seed'},
{id:8,req:'Указано время каждой операции/действия (точность и стандартизация)',score:1,weight:.7,comment:'',scoreSource:'seed'},
{id:9,req:'Указано время всей процедуры (ориентир для управления)',score:1,weight:.8,comment:'',scoreSource:'seed'},
{id:10,req:'Умещается в А3 - СОП удобен как конспект для инструктажа по методу 1+3+4+1',score:1,weight:.5,comment:'',scoreSource:'seed'},
{id:11,req:'СОП удобно расположен для пользования исполнителем',score:0,weight:1,comment:'',scoreSource:'seed'},
{id:12,req:'Легко установить даты инструктажей, инструкторов и обучаемых (чек-лист / журнал)',score:0,weight:.5,comment:'',scoreSource:'seed'},
{id:13,req:'Дата последнего изменения не более года, полугода, квартала',score:0,weight:.5,comment:'',scoreSource:'seed'}
];
const state={
 schemaVersion:DRAFT_VERSION,
 meta:{branch:'',date:'',department:'',workplace:'',executor:'',operation:'',sopNumber:'',safety:'',tools:'',material:'',approverPost:'',approverName:''},
 description:'',openQuestions:[],totalTimeSeconds:0,frvStudy:null,
 responsibles:[''],agreedList:[{post:'',name:''}],safetyIconIds:[],
 steps:[],
 frvMeta:{observers:'',quality:'',other:'',purpose:'зафиксировать текущее исполнение операции',tOp:'',tVdc:'',tM2:'',tM1:'',tMove:'',tArea:'',tIn:'',tOut:''},
 checklist:JSON.parse(JSON.stringify(CHECKLIST_DEFAULT)),
 // Заготовка отдельного учебного блока TWI JI: пока не участвует в текущем Excel/UX.
 twi:{enabled:false,trainer:"",trainee:"",prepare:{purpose:"",known:"",prep:"",interest:""},present:{round1:"",round2:"",round3:""},tryOut:{perform:"",explain:"",check:"",correct:""},followUp:{help:"",control:"",observe:"",close:""}},
  documentManager:{currentId:null,status:'Черновик',deptCode:'',year:new Date().getFullYear(),version:1,seqNo:null}
};
let stepIdCounter=0,currentModel=localStorage.getItem('sop-ai-model')||AI_DEFAULT_MODEL,reviewIssues=[],reviewSummary=null,_draftTimer=null,_logo=null,deferredIssueKeys=new Set(),showDeferredReviewIssues=false;
if(!YANDEX_MODELS.some(x=>x.id===currentModel))currentModel=AI_DEFAULT_MODEL;

