const zh = {
  // ── Tabs ──────────────────────────────────────────────────────────────────
  tab_today: "吃点啥",
  tab_shopping: "购物",
  tab_pantry: "食材",
  tab_recipes: "食谱",

  tab_profile: "我",
  tab_history: "历史",

  // ── Common ────────────────────────────────────────────────────────────────
  save: "保存",
  cancel: "取消",
  delete: "删除",
  confirm: "确认",
  loading: "加载中…",
  error: "错误",
  retry: "重试",
  validation_positive: "必须大于 0。",
  done: "完成",
  next: "下一步",
  back: "返回",
  skip: "跳过",
  add: "添加",
  edit: "编辑",
  share: "分享",
  generate: "生成",
  regenerate: "重新生成",
  saved: "已保存",
  empty: "暂无数据",

  // ── Auth ──────────────────────────────────────────────────────────────────
  forgot_password: "忘记密码？",
  reset_password: "重置密码",
  send_reset_link: "发送重置链接",
  reset_link_sent: "请查收邮件中的密码重置链接。",
  enter_email: "请输入您的邮箱。",
  sign_in: "登录",
  sign_up: "注册",
  sign_out: "退出登录",
  email: "邮箱",
  password: "密码",
  confirm_password: "确认密码",
  signing_in: "登录中…",
  creating_account: "创建账号中…",
  no_account: "还没有账号？",
  have_account: "已有账号？",
  sign_in_link: "去登录",
  sign_up_link: "去注册",
  app_tagline: "智能饮食，轻松生活。",
  welcome_back: "欢迎回来",
  create_account: "创建账号",
  start_discovering: "开始探索更健康的饮食",
  account_created: "账号已创建！请查收邮件确认链接，然后",
  sign_in_here: "在此登录。",
  enter_email_password: "请输入邮箱和密码。",
  passwords_no_match: "两次密码不一致。",
  password_too_short: "密码至少需要6个字符。",

  // ── Today / Daily Plan ────────────────────────────────────────────────────
  todays_plan: "今日饮食计划",
  plan_subtitle: "根据您的健康档案和食材，AI为您定制早中晚三餐。",
  cuisine_pref: "菜系偏好",
  cuisine_placeholder: "如：中式、日式、意式",
  max_prep: "最长烹饪时间（分钟）",
  generate_plan: "生成今日计划",
  regenerate_plan: "重新生成计划",
  total_calories: "千卡总计",
  nutrition_note_label: "营养提示",
  shopping_reminders: "采购提醒",
  shop_for_plan: "为本计划购物",
  share_plan: "分享计划",
  swap_meal: "换一个",
  per_serving: "每份",
  prep_time_label: "准备",
  generate_cta: "吃点啥",
  nutrition_estimated: "估算值 · 每份",
  macro_protein: "蛋白质",
  macro_carbs: "碳水",
  macro_fat: "脂肪",
  macro_fiber: "膳食纤维",
  ingredients_breakdown: "食材详情",
  add_all_to_cart: "全部加入购物清单",
  added_to_cart: "已添加",
  remove_all_from_cart: "移出购物车",
  swapping: "正在查找替代方案…",
  more_details: "更多详情",
  less: "收起",
  no_plan_title: "今天做点什么好？",
  no_plan_body: "wotoEAT 根据你的食材、口味和健康目标，做出真正值得吃的菜",
  welcome_step1: "添加食材，选择几个筛选条件",
  welcome_step2: "点击「吃点啥」，获取一道真实可做的菜",
  welcome_step3: "确认菜品，自动生成购物清单",
  using_from_pantry: "已有食材：",
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",

  // ── Profile ───────────────────────────────────────────────────────────────
  your_profile: "健康档案",
  profile_subtitle: "用于个性化您的每日饮食计划",
  body_metrics: "身体指标",
  age: "年龄",
  sex: "性别",
  weight_kg: "体重（公斤）",
  height_cm: "身高（厘米）",
  male: "男",
  female: "女",
  other: "其他",
  activity_level: "运动水平",
  health_goals: "健康目标",
  dietary_restrictions: "饮食禁忌",
  allergies: "过敏原",
  allergies_hint: "逗号分隔，如：花生、贝类",
  allergies_placeholder: "如：花生、贝类",
  save_profile: "保存档案",
  profile_saved: "档案已保存",
  language: "语言",
  language_en: "English",
  language_zh: "中文",
  use_imperial: "使用英制单位（磅 / 英寸）",
  calorie_goal: "每日卡路里目标",
  calorie_goal_placeholder: "如：2000",
  protein_goal: "每日蛋白质目标（克）",
  protein_goal_placeholder: "如：120",
  protein_today: "今日蛋白质",
  protein_of_goal: "目标",
  weight_lbs: "体重（磅）",
  height_in: "身高（英寸）",

  // ── Pantry ────────────────────────────────────────────────────────────────
  pantry_intro: "这里的食材会自动从购物清单中扣除。",
  add_ingredient: "添加食材",
  ingredient_name: "食材名称",
  ingredient_name_placeholder: "如：橄榄油",
  amount: "数量",
  amount_placeholder: "如：500",
  unit: "单位",
  add_to_pantry: "添加到食材库",
  pantry_empty_title: "食材库为空",
  pantry_empty_body: "添加您已有的食材，我们会在购物清单中自动跳过它们。",
  pantry_count: (n: number) => `共 ${n} 种食材`,
  pantry_name_exists: "该食材已存在。",
  missing_fields: "请输入食材名称和数量。",
  missing_name: "请输入食材名称。",
  missing_amount: "请输入数量。",
  invalid_amount: "数量必须为大于0的数字。",
  edit_ingredient: "编辑食材",
  saving: "保存中…",

  // ── Receipt scanning ──────────────────────────────────────────────────────
  scan_receipt: "扫描小票",
  scan_intro: "拍摄购物小票，自动识别并添加食材到食材库。",
  scan_take_photo: "拍照",
  scan_pick_photo: "从相册选择",
  scan_processing: "正在识别小票…",
  scan_processing_hint: "通常只需几秒钟。",
  scan_found: (n: number) => `识别到 ${n} 种食材`,
  scan_breakdown: (matched: number, nonFood: number) => {
    const parts: string[] = [];
    if (matched > 0) parts.push(`${matched} 项已在食材库`);
    if (nonFood > 0) parts.push(`${nonFood} 项非食材`);
    return parts.join(" · ");
  },
  scan_edit_hint: "点击名称可编辑，取消勾选不需要的项目。",
  scan_already_have: "已在食材库",
  scan_not_food: "非食材",
  scan_add_items: (n: number) => `添加 ${n} 种食材`,
  scan_rescan: "重新扫描",
  scan_no_items_checked: "请至少选择一项。",
  scan_err_no_receipt: "未能从照片中识别出小票，请靠近一些重拍。",
  scan_err_no_food: "未在小票上识别到食材。",
  scan_err_generic: "扫描失败，请重试。",
  scan_rate_limited: "已达到扫描次数上限，请一小时后再试。",
  scan_camera_denied: "扫描小票需要相机权限，请在设置中开启。",

  // ── Shopping ──────────────────────────────────────────────────────────────
  generate_list: "生成购物清单",
  shopping_empty_title: "购物清单为空",
  shopping_empty_body: "在发现页确认餐食，或从食谱页添加食谱，然后点击生成购物清单。",
  no_recipes_selected: "请先在食谱页面添加食谱。",
  items_progress: (checked: number, total: number) => `${checked} / ${total} 项`,

  // ── Network ───────────────────────────────────────────────────────────────
  no_internet: "无网络连接",
  offline_note: "部分功能暂时不可用",

  // ── Recipes ───────────────────────────────────────────────────────────────
  find_recipe: "搜索食谱",
  find_recipe_hint: "输入任意菜名，AI即刻为您生成完整食谱。",
  dish_name_placeholder: "如：宫保鸡丁、番茄炒蛋、红烧肉…",
  no_dish_name: "请先输入菜品名称。",
  generating_recipe: "正在生成食谱…",
  recipe_preview: "食谱预览",
  generate_another: "换个菜品",
  add_recipe_url: "通过链接添加食谱",
  import_from_url: "导入链接",
  no_recipes_title: "暂无保存的食谱",
  no_recipes_body: "粘贴任意食谱链接，AI会为您提取标题、食材和步骤。",
  recipe_count: (n: number) => `已保存 ${n} 个食谱`,
  parse_url_hint: "粘贴食谱链接，AI会自动提取标题、食材和烹饪步骤。",
  parse: "解析",
  save_to_recipes: "保存到我的食谱",
  parse_url_placeholder: "https://www.example.com/recipe/...",
  parse_invalid_url: "请输入以 https:// 开头的完整链接。",

  // ── Expanded meal card ────────────────────────────────────────────────────
  in_pantry: "已有",
  ingredients_label: "配料",
  steps_label: "烹饪步骤",
  chef_tips_label: "厨师技巧",
  find_recipes_online: "搜索相关食谱",
  min_label: "分钟",
  difficulty_easy: "简单",
  difficulty_medium: "中等",
  difficulty_hard: "困难",

  // ── History ───────────────────────────────────────────────────────────────
  history_heading: "饮食历史",
  history_subtitle: "您的历史饮食计划。",
  history_empty_title: "暂无历史记录",
  history_empty_body: "生成第一个每日计划后，它将显示在这里。",
  calories_label: "千卡",
  search_history: "搜索历史…",
  load_more: "加载更多",
  weekly_cal_chart: "本周卡路里",

  // ── My Recipes ────────────────────────────────────────────────────────────
  tab_my_recipes: "我的食谱",
  saved_tab: "收藏",
  liked_tab: "喜欢",
  mine_tab: "我的",
  mark_favorite: "收藏",
  mark_frequent: "常做",
  mark_done: "标记已做",
  done_reduces_pantry: "匹配的食材将从库存中扣除。",
  remove_label: "移除",
  new_recipe: "新建食谱",
  my_recipe: "我的食谱",
  add_tag: "添加标签",
  recipe_title_placeholder: "食谱名称…",
  unconfirm: "取消计划",
  edit_field_prep: "备餐时间（分钟）",
  edit_field_calories: "每份热量",
  edit_field_servings: "份量",
  edit_field_ingredients: "食材",
  edit_field_steps: "步骤",
  tags_label: "标签",
  more_tags: (n: number) => `+${n}`,

  // ── Servings ──────────────────────────────────────────────────────────────
  servings: "份量",
  servings_people: (n: number) => `${n}人份`,

  // ── Plan settings ─────────────────────────────────────────────────────────
  plan_settings: "设置",
  all_meals: "全部",
  snack: "零食",
  show_settings: "筛选与设置",

  // ── Profile complete ───────────────────────────────────────────────────────
  complete_profile: "完善个人资料",
  complete_profile_sub: "填写健康信息以获取更精准的饮食建议。",
  complete_profile_btn: "立即设置",

  // ── Shopping (in pantry) ──────────────────────────────────────────────────
  shopping_list: "购物清单",
  cart_empty: "购物清单为空",
  cart_empty_sub: "在食谱中添加菜品，然后生成购物清单。",

  // ── Onboarding ────────────────────────────────────────────────────────────
  onboarding_welcome: "欢迎使用 吃点啥",
  onboarding_welcome_sub: "智能饮食，轻松生活。",
  onboarding_step1: "身体数据",
  onboarding_step2: "健康目标",
  onboarding_step3: "我的食材",
  onboarding_step1_sub: "帮助我们了解您的基本情况。",
  onboarding_step2_sub: "您希望通过饮食实现什么目标？",
  onboarding_step3_sub: "添加您家中已有的食材。",
  onboarding_finish: "开始规划",
  onboarding_get_started: "立即开始",
  onboarding_age_placeholder: "如：28",
  onboarding_weight_placeholder: "如：70",
  onboarding_height_placeholder: "如：170",

  // ── Find Recipe modal ─────────────────────────────────────────────────────
  popular_dishes: "热门菜品",

  // ── Meal preferences (profile) ────────────────────────────────────────────
  meal_preferences: "饮食偏好",
  preferred_cuisines: "菜系",
  preferred_cuisines_hint: "生成饮食计划时自动选择。",
  flavour_pref: "口味",
  prep_time_pref: "准备时间",

  // ── Filters (discover) ────────────────────────────────────────────────────
  meal_type: "餐次",
  search_recipes: "搜索食谱…",
  from_pantry: "来自我的食材",

  // ── Allergies ─────────────────────────────────────────────────────────────
  allergy_other: "其他",
  allergy_other_placeholder: "如：芥末、乳胶",
  restriction_other_placeholder: "如：低FODMAP、生食",

  // ── Serving size (meal card) ──────────────────────────────────────────────
  serving_size: "份量",
  for_n_people: "供",

  // ── Discover / meal card ──────────────────────────────────────────────────
  meal_saved_toast: "已保存 — 前往食谱编辑",

  // ── Profile restrictions ──────────────────────────────────────────────────
  ai_custom_note: "注意：AI可能不完全遵守自定义限制，请在烹饪前检查计划。",

  // ── Forgot password ───────────────────────────────────────────────────────
  reset_password_hint: "请输入您的邮箱，我们将发送重置链接。",
  sending: "发送中…",

  // ── About the creator ─────────────────────────────────────────────────────
  about_creator: "关于作者",
  about_support: "支持项目",
  about_copyright: "© 2026 Jerry Wang · wotoEAT",

  // ── Meal style filter ─────────────────────────────────────────────────────
  meal_style_label: "餐点类型",

  // ── Recipe edit mode ─────────────────────────────────────────────────────
  edit_title_required: "请输入标题。",
  edit_placeholder_prep: "如：30",
  edit_placeholder_calories: "如：450",
  edit_placeholder_servings: "如：2",
  edit_placeholder_ingredient: "食材名称",
  edit_placeholder_amount: "用量",
  edit_placeholder_unit: "单位",
  edit_add_ingredient: "添加食材…",
  edit_add_step: "添加步骤…",
  step_placeholder: (n: number) => `第 ${n} 步`,
  save_to_mine: "存入「我的」",

  // ── Discover screen ───────────────────────────────────────────────────────
  tap_for_details: "点击查看详情",
  include_tags_label: "包含标签",
  add_tag_or_ingredient: "添加食材或标签…",
  cached_label: "缓存",
  clear_filters: "清除筛选条件",

  // ── History tab ───────────────────────────────────────────────────────────
  history_generate_save: "生成并保存食谱",
  history_saved_banner: "已保存到食谱",
  history_failed_banner: "生成失败，请重试",

  // ── Find recipe modal ─────────────────────────────────────────────────────
  more_ingredients: (n: number) => `+${n} 种食材`,

  // ── Onboarding bullets ───────────────────────────────────────────────────
  onboarding_bullet_1: "根据您的需求智能生成餐饮计划",
  onboarding_bullet_2: "管理食材库存，减少浪费",
  onboarding_bullet_3: "智能购物清单",
  onboarding_save_error: "无法保存您的信息，请检查网络连接后重试。",

  // ── Landing page ──────────────────────────────────────────────────────────
  landing_hero_title: "每一餐，都帮你想好。",
  landing_hero_sub: "AI 专属定制饮食方案。根据你的健康目标、手头食材与口味偏好，一键生成今日食谱。",
  landing_f1_title: "不纠结的专属餐单",
  landing_f1_sub: "告别“今天吃什么”的终极难题，AI 为你量身精配一日三餐。",
  landing_f2_title: "拯救冰箱剩菜",
  landing_f2_sub: "家里剩啥就做啥，AI 帮你把零散食材变成限定美味，省钱又环保。",
  landing_f3_title: "打造专属私房菜谱",
  landing_f3_sub: "随心定制、一键收藏，让每一次满意的味道都能完美复刻。",
  landing_cta_start: "开启你的免费饮食计划",
  landing_cta_signin: "已有账号？",
  landing_fine_print: "无需信用卡 · 免费使用",
  landing_learn_more: "了解更多",
} as const;

export default zh;
