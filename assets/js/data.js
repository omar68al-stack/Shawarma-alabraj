// شاورما الأبراج — البيانات الافتراضية (قابلة للتعديل من واجهة الموقع، وتُحفظ في localStorage)

const STORAGE_KEY = 'shawarma-alabraj-dashboard-v1';

// أرقام سرية بسيطة لصفحات الدخول الخاصة (الكاشير والشيف والمسوّقة) — حماية بسيطة فقط لمنع الفضول، وليست حماية حقيقية
// لتغييرها: عدّل القيم هنا مباشرة
const CASHIER_PIN = '1234';
const CHEF_PIN = '2580';
const MARKETER_PIN = '3690';

// رابط Google Apps Script Web App لمزامنة العهدة والجرد والتسويق بين الأجهزة (كل واحد من جواله الشخصي)
// اتركه فاضياً '' لتعطيل المزامنة والعمل محلياً بس على نفس الجهاز — راجع google-apps-script/DataSync.gs للتركيب
const SYNC_URL = 'https://script.google.com/macros/s/AKfycbzf-BDB_QAS2phuXfrUitkAR-xNQKFYAZycgLrmpuHTBPC1Z6bZS_WWOHKfuus8moLT/exec';

const DEFAULT_STATE = {
  // مبيعات يومية (نطاق سيء/جيد)
  salesLow: 1600,
  salesHigh: 2000,

  // كيلوجرامات الدجاج المُعلّق يومياً (نطاق)
  kgLow: 30,
  kgHigh: 40,

  // الرواتب الشهرية
  salaries: {
    chef: { label: 'الشيف', value: 3300 },
    cashier: { label: 'الكاشير', value: 2200 },
    worker1: { label: 'عامل 1', value: 1600 },
    worker2: { label: 'عامل 2', value: 1600 },
    accountant: { label: 'المحاسبة', value: 500 },
    marketer: { label: 'التسويق', value: 600 },
  },

  // تكاليف تشغيلية ثابتة
  rentYearly: 15000,
  utilities: 2000, // كهرباء وسكن
  internet: 1000,  // إنترنت وتأمينات

  // تكاليف مواد مباشرة (متغيرة)
  chicken: 25000,
  sides: 6000,   // بطاطس + مخلل + خبز
  pepsi: 4000,

  // تغليف
  plastic: 3900,

  // تكاليف الإنشاء والافتتاح (لمرة واحدة — معلومة مرجعية فقط)
  startupCost: 120000,

  // سداد الديون — الترتيب هو ترتيب الأولوية المقترح للسداد (الأول يُسدَّد أولاً)
  debts: [
    { id: 'debt-ameer', name: 'أمير الباكستاني', amount: 1000, note: 'أصغر مبلغ — سداد سريع يريحك نفسياً ويقفل أول دين بالكامل.' },
    { id: 'debt-zakat', name: 'هيئة الزكاة والضريبة', amount: 16000, note: 'جهة رسمية — التأخير قد يعني غرامات، فله أولوية عالية.' },
    { id: 'debt-wafa', name: 'قرض وفاء', amount: 5000, note: 'قرض بأقساط ثابتة — التأخير قد يؤثر على السجل الائتماني، من الأفضل عدم تأخير القسط.' },
    { id: 'debt-aljazira', name: 'ثلاجة الجزيرة', amount: 21000, note: 'المورد الأساسي — تسويته يفتح باب التفاوض على أسعار أفضل ويوقف تراكم دين جديد.' },
    { id: 'debt-mubdioon', name: 'مبدعون للدعاية والإعلان', amount: 10000, note: 'خدمة تسويقية — أقل إلحاحاً من الجهات الرسمية والمورّد التشغيلي.' },
  ],
  debtMonthlyTarget: 5000,

  // مشتريات قادمة (معدات مخطط شراؤها) — الترتيب هو أولوية الشراء المقترحة
  upcomingPurchases: [
    { id: 'buy-garlic', name: 'مكينة ثوم', estimatedCost: 0, purchased: false, note: 'تسريع تحضير صوص الثوم وتقليل الوقت اليدوي.' },
    { id: 'buy-slicer', name: 'قصاصة شاورما', estimatedCost: 0, purchased: false, note: 'ضبط سماكة التقطيع بثبات — يخفّض الهدر ويحسّن نسبة تكلفة المواد المرتفعة حالياً (72%).' },
    { id: 'buy-bike', name: 'دباب توصيل للمحل', estimatedCost: 0, purchased: false, note: 'يفعّل التوصيل المباشر ويرفع المبيعات دون الاعتماد الكامل على عمولات تطبيقات التوصيل.' },
  ],

  // مستهدفات تسويقية أسبوعية بسيطة (نشاطات بدون تكلفة تشغيلية إضافية)
  marketingGoals: [
    { id: 'mkt-influencers', name: 'دعوات للمشاهير/المؤثرين المحليين', targetPerWeek: 1, unit: 'دعوة' },
    { id: 'mkt-cards', name: 'توزيع كروت توصيل على الجيران', targetPerWeek: 50, unit: 'كرت' },
  ],
  // سجل الأسابيع (الفعلي مقابل كل مستهدف)
  marketingLogs: [],

  // معاملات ومتابعات إدارية — حالة كل بند: pending (لم يبدأ) / in_progress (جارٍ) / done (منجز)
  adminTasks: [
    { id: 'admin-registry', category: 'store', name: 'نقل السجل', status: 'pending' },
    { id: 'admin-baladi', category: 'store', name: 'تجديد رخصة بلدي', status: 'pending' },
    { id: 'admin-civildefense', category: 'store', name: 'تجديد الدفاع المدني', status: 'pending' },
    { id: 'admin-mudad', category: 'store', name: 'تسجيل في مدد للرواتب', status: 'pending' },
    { id: 'admin-qiwa', category: 'store', name: 'تجديد رسوم قوى', status: 'pending' },
    { id: 'admin-bloodtest', category: 'hr', name: 'فحص الدم للعمالة', status: 'pending' },
    { id: 'admin-iqama-junaid', category: 'hr', name: 'تجديد إقامة جنيد', status: 'pending' },
    { id: 'admin-iqama-iqbal', category: 'hr', name: 'تجديد إقامة اقبال', status: 'pending' },
    { id: 'admin-healthcert', category: 'hr', name: 'استخراج الشهادات الصحية', status: 'pending' },
  ],

  // عهدة الكاشير الأسبوعية — تُدار من صفحة منفصلة (cashier.html) يدخل عليها الكاشير مباشرة
  cashierFund: {
    // كل أسبوع: { weekStart, allowance, entries: [{ id, time, amount, description }] } — الأخير هو الأسبوع الحالي
    weeks: [],
  },

  // حالة قائمة الخطة التصحيحية (تُعبّأ ديناميكياً بمعرّفات العناصر)
  checklist: {},

  // سجل الجرد اليومي (أحدث إدخال أولاً بعد الفرز)
  inventoryLogs: [
    {
      date: '2026-08-07',
      chickenRemainingKg: 89.25,
      chickenConsumedKg: 33,
      items: [
        { name: 'زيت عافية', unit: 'حبة', remaining: '1', consumed: '' },
        { name: 'طحينة', unit: 'كيلو', remaining: '1.5', consumed: '' },
        { name: 'مخلل خيار', unit: 'جركل', remaining: '0.5', consumed: '' },
        { name: 'مخلل مشكل', unit: 'حبة', remaining: '0.25', consumed: '' },
        { name: 'مايونيز', unit: 'حبة', remaining: '4.5', consumed: '1.5' },
        { name: 'جبن شيدر', unit: 'حبة', remaining: '1.75', consumed: '0.5' },
        { name: 'جبن شرائح', unit: 'ربطة', remaining: '20', consumed: '2 ربطة و4 حبات' },
        { name: 'كاتشب', unit: 'حبة', remaining: '1.5', consumed: '0.5' },
        { name: 'شطة', unit: 'حبة', remaining: '3', consumed: '0.25' },
        { name: 'بطاطس', unit: 'كرتون/كيس', remaining: '2 كرتون و3 أكياس', consumed: '2 كرتون' },
        { name: 'حليب', unit: 'حبة', remaining: '8', consumed: '' },
        { name: 'زيت العربي', unit: 'حبة', remaining: '0.5', consumed: '' },
        { name: 'زنجر بارد', unit: 'حبة', remaining: '4.5', consumed: '' },
        { name: 'زنجر حار', unit: 'حبة', remaining: '4.5', consumed: '' },
        { name: 'برقر', unit: 'كيس', remaining: '1', consumed: '' },
        { name: 'مناديل', unit: 'رول', remaining: '', consumed: '2' },
        { name: 'أكياس', unit: 'كرتون', remaining: '', consumed: '1' },
      ],
      largePie: { total: 170, remaining: 66 },
      smallPie: { total: 25, remaining: 14 },
    },
  ],
};

// خطة العمل التصحيحية العاجلة — مبنية على تحليل "شاورما الأبراج" (أغسطس 2026)، مقسّمة على 3 مراحل زمنية
const CORRECTIVE_PHASES = [
  {
    id: 'phase-1',
    title: 'المرحلة الأولى — إيقاف النزيف',
    duration: 'أول 30 يوماً',
    items: [
      { id: 'p1-1', text: 'وقف الشراء بالآجل فوراً؛ التحول للشراء النقدي أو المسبق الدفع فقط.' },
      { id: 'p1-2', text: 'جرد كامل لإجمالي الديون المستحقة لثلاجة الجزيرة وأي موردين آخرين، ووضع جدول سداد أسبوعي واضح.' },
      { id: 'p1-3', text: 'فتح حساب بنكي مخصص للمحل فقط، وإيداع كامل الكاش اليومي فيه دون خلط بالمصروفات الشخصية.' },
      { id: 'p1-4', text: 'تطبيق نظام عُهدة يومية ثابتة للمصروفات النثرية، مع تسجيل كل مصروف.' },
      { id: 'p1-5', text: 'قياس الهدر الفعلي: وزن الدجاج المستلم يومياً مقابل المُستخدم فعلياً في البيع لمدة أسبوعين لتحديد نسبة الفاقد بدقة (استخدم تبويب "الجرد اليومي").' },
    ],
  },
  {
    id: 'phase-2',
    title: 'المرحلة الثانية — ضبط الهامش',
    duration: '30–90 يوماً',
    items: [
      { id: 'p2-1', text: 'إعادة تسعير القائمة أو ضبط أحجام الحصص بحيث تنخفض نسبة تكلفة المواد إلى 30%–35% من الإيراد.' },
      { id: 'p2-2', text: 'التفاوض مع مورد بديل أو مع ثلاجة الجزيرة على سعر أفضل مقابل الدفع الفوري.' },
      { id: 'p2-3', text: 'تركيب نظام نقاط بيع (POS) بسيط يربط المبيعات بالمخزون تلقائياً لمعرفة الهدر لحظياً.' },
      { id: 'p2-4', text: 'تفعيل تطبيقات التوصيل وقياس أثرها على الإيراد اليومي.' },
    ],
  },
  {
    id: 'phase-3',
    title: 'المرحلة الثالثة — الاستقرار والنمو',
    duration: 'بعد 90 يوماً',
    items: [
      { id: 'p3-1', text: 'عدم التفكير في فرع ثانٍ إلا بعد تحقيق ربحية صافية مستقرة في الفرع الأول لثلاثة أشهر متتالية على الأقل.' },
      { id: 'p3-2', text: 'تجهيز احتياطي نقدي (Reserve) يغطي مصروف شهر كامل قبل أي توسع.' },
      { id: 'p3-3', text: 'توثيق كل الدروس المستفادة في دليل تشغيلي (SOP) يُستخدم كمرجع عند افتتاح الفرع الثاني.' },
    ],
  },
];

const ROOT_CAUSES = [
  { cause: 'الشراء بالآجل من المورد', effect: 'تراكم التزامات مالية دون مقابل نقدي فوري، فتكبر الديون بصمت حتى تتجاوز قدرة المحل على السداد.' },
  { cause: 'غياب الفصل بين الإيراد والمصروف', effect: 'اختلاط الكاش الداخل مع المصروفات اليومية يجعل من المستحيل معرفة الربح الحقيقي أو تتبع أين يذهب المال.' },
  { cause: 'ارتفاع نسبة الهدر (Food Cost مرتفع)', effect: '38,900 ريال شهرياً في المواد المباشرة مقابل إيراد لا يتجاوز 60,000 يعني أن جزءاً كبيراً من الدجاج والمخلل والصوصات يُفقد دون أن يتحول إلى مبيعات.' },
  { cause: 'هامش ربح شبه معدوم', effect: 'حتى في أفضل الأيام، الربح لا يتجاوز 7,050 ريال شهرياً، وهو غير كافٍ لتغطية أي طارئ أو لبدء استرداد رأس المال (120,000 ريال).' },
  { cause: 'الإرهاق النفسي لصاحب المشروع', effect: 'الشعور بالتعب ("الطفش") مؤشر حقيقي على أن غياب الأنظمة يستنزف الجهد اليومي بلا نتيجة واضحة.' },
];
