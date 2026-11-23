// The game's tables: items, tools, resource nodes, recipes, vehicles, fish, the mine, furniture.
// Balance lives here, so tuning the game is a matter of editing numbers, not code.

import { $t } from '../i18n'
export type ItemKind = 'material' | 'fish' | 'tool' | 'gear' | 'part' | 'furniture' | 'critter' | 'crop' | 'food' | 'bait'
/** 0 common · 1 uncommon · 2 rare · 3 epic */
export type Rarity = 0 | 1 | 2 | 3
export const RARITY_NAME = [$t('普通'), $t('少见'), $t('稀有'), $t('传说')]

export interface ItemDef {
  name: string
  /** what one unit is worth, in coins: the anchor for every price in the market */
  value: number
  kind: ItemKind
  rarity: Rarity
  /** one line for the tooltip: what it is and what it is for */
  desc: string
}

const I = (name: string, value: number, kind: ItemKind, rarity: Rarity, desc: string): ItemDef => ({ name, value, kind, rarity, desc })

const ITEM_TABLE = {
  // picked up by hand
  stick: I($t('树枝'), 1, 'material', 0, $t('树下捡的。做第一把斧头、镐和钓竿。')),
  pebble: I($t('卵石'), 1, 'material', 0, $t('地上捡的。配上树枝就是石器。')),
  fiber: I($t('纤维'), 3, 'material', 0, $t('亚麻丛里采的。搓绳、织帆布。')),
  berry: I($t('浆果'), 6, 'material', 0, $t('灌木和果树上的。别的岛爱收。')),
  flower: I($t('野花'), 4, 'material', 0, $t('徒手采的。做花坛之类的装饰。')),
  shell: I($t('贝壳'), 6, 'material', 0, $t('沙滩上捡的。做风铃，也能卖。')),
  // timber (an axe)
  wood: I($t('木材'), 4, 'material', 0, $t('橡树、果树砍下来的。锯木板，也当燃料。')),
  pine: I($t('松木'), 6, 'material', 0, $t('轻而直。雾松岛盛产，做家具好看。')),
  palm: I($t('棕榈木'), 6, 'material', 0, $t('耐水。环礁上长的，适合做户外家具。')),
  // stone and ore (a pick)
  stone: I($t('石料'), 3, 'material', 0, $t('砌熔炉、垒花坛。矿洞里到处都是。')),
  coal: I($t('煤'), 6, 'material', 0, $t('炼铁炼金要它。矿洞浅层就有。')),
  copperOre: I($t('铜矿石'), 8, 'material', 0, $t('橙色带绿锈的矿块。炼成铜锭。')),
  ironOre: I($t('铁矿石'), 12, 'material', 1, $t('带锈红条纹的矿石，矿洞 3 层以下。要铜镐。')),
  goldOre: I($t('金矿石'), 34, 'material', 2, $t('浅色岩石里的亮黄斑点，深层才有。要铁镐。')),
  crystal: I($t('水晶'), 64, 'material', 2, $t('竖着长的蓝紫晶簇。稀有家具的材料。')),
  moonstone: I($t('月光石'), 160, 'material', 3, $t('矿洞最深处偶尔一见。传说家具非它不可。')),
  // made at the workbench or in the furnace
  plank: I($t('木板'), 10, 'part', 0, $t('木材锯的。造船、造飞机、做家具。')),
  cloth: I($t('帆布'), 12, 'part', 0, $t('纤维织的。机翼蒙皮和船帆。')),
  rope: I($t('绳索'), 8, 'part', 0, $t('纤维搓的。钓线、鱼枪、缆绳。')),
  copperIngot: I($t('铜锭'), 26, 'part', 0, $t('熔炉炼的。工具、骨架、氧气瓶。')),
  ironIngot: I($t('铁锭'), 42, 'part', 1, $t('要用煤来炼。铁器和喷气机。')),
  goldIngot: I($t('金锭'), 110, 'part', 2, $t('稀有家具和高级改装用。')),
  restaurantKit: I($t('餐厅套件'), 120, 'part', 1, $t('在岛上搭一座露天餐厅：做饭，也能请来送货的客人吃饭。')),
  furnaceKit: I($t('熔炉套件'), 40, 'part', 0, $t('在空地上放下，就是一座熔炉。')),
  ranchKit: I($t('牧场套件'), 400, 'part', 2, $t('在岛上搭一座牧场：两只同种的宠物住进去，过一天就有小的。')),
  shopKit: I($t('小店套件'), 600, 'part', 2, $t('在岛上开一间小店：摆上货、标好价，出门时也有人来买。')),
  depotKit: I($t('货运站套件'), 900, 'part', 2, $t('在岛上盖一座货运站：雇人替你跑安全航线。')),
  lighthouseKit: I($t('灯塔套件'), 1200, 'part', 3, $t('在岛边立一座灯塔：过往的船交过路费，还会有货要你转运。')),
  exchangeKit: I($t('交易所套件'), 1600, 'part', 3, $t('在岛上盖一座交易所：各种货的价钱一天到晚在变。')),
  // the way to the far shore: a piece from each islander who has become an old friend
  chartPiece: I($t('海图残片'), 0, 'part', 2, $t('岛主送的。集齐四片，在工作台上拼成远海海图。')),
  seaChart: I($t('远海海图'), 0, 'part', 3, $t('四片残片拼成的。上面标着海的那一边。')),
  // seeds: planted on your own island (in the house, like furniture)
  acorn: I($t('橡果'), 3, 'material', 0, $t('砍橡树有时会掉。种下去，过一阵长成树。')),
  berrySeed: I($t('浆果苗'), 5, 'material', 0, $t('采浆果有时会带出一棵小苗。种下去长成灌木。')),
  flaxSeed: I($t('亚麻籽'), 3, 'material', 0, $t('割亚麻时抖落的。种下去长成亚麻丛。')),
  // fish: rod (the first five) and diving
  sardine: I($t('沙丁鱼'), 5, 'fish', 0, $t('哪片海都有的小鱼。')),
  bream: I($t('鲷鱼'), 10, 'fish', 0, $t('近岸常见，肉厚。')),
  mackerel: I($t('鲭鱼'), 16, 'fish', 1, $t('游得快，上钩后很会挣扎。')),
  tuna: I($t('金枪鱼'), 44, 'fish', 2, $t('大家伙。线会绷得很紧。')),
  moonfish: I($t('月光鱼'), 130, 'fish', 3, $t('传说里的鱼，鳞片像月光。')),
  flyingFish: I($t('飞鱼'), 14, 'fish', 0, $t('只有开船出海才钓得到：贴着浪尖飞。')),
  bonito: I($t('鲣鱼'), 24, 'fish', 1, $t('外海成群的快鱼。离岛远一点才有。')),
  swordfish: I($t('旗鱼'), 160, 'fish', 3, $t('远海深水里的大家伙，长长的剑吻。钓上一条够吹一年。')),
  creel: I($t('鱼筐'), 24, 'gear', 0, $t('背着它，钓上来的鱼先进筐（20 条），不占背包。')),
  reefFish: I($t('珊瑚鱼'), 11, 'fish', 0, $t('浅水礁石间成群游。潜水时用鱼枪打。')),
  grouper: I($t('石斑鱼'), 24, 'fish', 1, $t('躲在礁石下面，要打两枪。')),
  octopus: I($t('章鱼'), 48, 'fish', 2, $t('深一点才有，受惊就喷墨逃走。')),
  urchin: I($t('海胆'), 8, 'fish', 0, $t('海底捡的。')),
  lobster: I($t('龙虾'), 28, 'fish', 1, $t('深水的石缝里。')),
  angelfish: I($t('神仙鱼'), 30, 'fish', 1, $t('暖水礁石间，又高又扁，黑白黄条纹。')),
  ray: I($t('鳐鱼'), 40, 'fish', 1, $t('贴着沙底滑行，像一张会飞的毯子。')),
  squid: I($t('鱿鱼'), 34, 'fish', 1, $t('深一点的冷水里，一受惊就窜得飞快。')),
  pearl: I($t('珍珠'), 90, 'fish', 2, $t('偶尔在海底的贝里。稀有家具的材料。')),
  // tools: owning one is enough (they do not wear out)
  stoneAxe: I($t('石斧'), 6, 'tool', 0, $t('能砍小树和普通的树。')),
  copperAxe: I($t('铜斧'), 60, 'tool', 0, $t('砍得快一倍，能放倒大树。')),
  ironAxe: I($t('铁斧'), 100, 'tool', 1, $t('三倍的力气。')),
  stonePick: I($t('石镐'), 7, 'tool', 0, $t('能挖石头、煤和铜矿。')),
  copperPick: I($t('铜镐'), 86, 'tool', 0, $t('挖得快一倍，能挖铁矿和硬岩。')),
  ironPick: I($t('铁镐'), 136, 'tool', 1, $t('什么都挖得动：金矿、水晶、月光石。')),
  shovel: I($t('铲子'), 10, 'tool', 0, $t('拿在手上点地面：铲平一块地，顺手清掉草和石子。')),
  rod: I($t('钓竿'), 12, 'tool', 0, $t('站在岸边或码头上，点水面甩竿。')),
  harpoon: I($t('鱼枪'), 80, 'gear', 0, $t('潜水时点鱼就射。')),
  // round 13: what goes on the hook (live bait is used up, a lure is kept)
  worm: I($t('蚯蚓'), 2, 'bait', 0, $t('拿铲子在平平的草地上挖。什么鱼都吃。')),
  shrimp: I($t('小虾'), 4, 'bait', 0, $t('拿铲子在沙滩上挖。鲷鱼最爱。')),
  breadBait: I($t('面团饵'), 3, 'bait', 0, $t('小麦揉的。沙丁鱼成群地来。')),
  squidBait: I($t('鱿鱼块'), 10, 'bait', 1, $t('切开的鱿鱼。大鱼闻得到。')),
  spinner: I($t('亮片'), 40, 'bait', 0, $t('一转一闪。鲭鱼追着咬。用不坏。')),
  softLure: I($t('软虫'), 24, 'bait', 0, $t('橡胶做的虫。鲷鱼和沙丁鱼都上当。用不坏。')),
  glowLure: I($t('夜光饵'), 160, 'bait', 2, $t('夜里发光。月亮鱼只认它。用不坏。')),
  tank: I($t('氧气瓶'), 120, 'gear', 1, $t('潜水的时间从 45 秒加到 80 秒。')),
  lantern: I($t('提灯'), 40, 'gear', 0, $t('矿洞里照得更远。')),
  net: I($t('捕虫网'), 10, 'tool', 0, $t('慢慢走近，点一下就挥网。螃蟹、蝴蝶、海鸥都能捉。')),
  // the island's small creatures (a net)
  hermitCrab: I($t('寄居蟹'), 14, 'critter', 0, $t('背着别人的壳在沙滩上走。什么时候都有。')),
  redCrab: I($t('红螃蟹'), 20, 'critter', 0, $t('白天在沙滩上横着跑，一靠近就钻进沙里。')),
  gull: I($t('海鸥'), 45, 'critter', 1, $t('站在沙滩上东张西望。走太快它就飞了。')),
  whiteButterfly: I($t('白粉蝶'), 10, 'critter', 0, $t('晴天围着花和草飞。')),
  swallowtail: I($t('凤尾蝶'), 32, 'critter', 1, $t('晴天在花丛里。翅膀黄黑相间。')),
  morpho: I($t('蓝闪蝶'), 140, 'critter', 2, $t('只在树多的岛上、晴天的林子里。一闪就不见。')),
  ladybug: I($t('瓢虫'), 12, 'critter', 0, $t('白天在草地和灌木上慢慢爬。')),
  dragonfly: I($t('蜻蜓'), 26, 'critter', 0, $t('白天贴着岸边的水面飞。')),
  firefly: I($t('萤火虫'), 34, 'critter', 1, $t('夜里在草地上一闪一闪。')),
  moonMoth: I($t('月光蛾'), 180, 'critter', 2, $t('只在夜里、树林边。翅膀会发光。')),
  snail: I($t('蜗牛'), 18, 'critter', 0, $t('只有下雨的时候才出来。')),
  frog: I($t('青蛙'), 24, 'critter', 0, $t('下雨时在岸边的草里跳。')),
  // the farm: seeds (planted in a bed) and what they give
  wateringCan: I($t('水壶'), 20, 'gear', 0, $t('给菜地浇水：一次浇一整排。菜地一天要浇一次，没浇那天就不长。')),
  fertilizer: I($t('肥料'), 8, 'material', 0, $t('堆肥箱里沤出来的。撒在种了东西的地里：长得更快，多收一个。')),
  carrotSeed: I($t('胡萝卜种子'), 2, 'material', 0, $t('种在菜地里，浇了水，不到半天长成胡萝卜。')),
  wheatSeed: I($t('麦种'), 2, 'material', 0, $t('种在菜地里，浇了水，不到半天长成小麦。')),
  strawberrySeed: I($t('草莓苗'), 4, 'material', 0, $t('种在菜地里，浇足大半天的水结出草莓。')),
  pumpkinSeed: I($t('南瓜子'), 8, 'material', 1, $t('种在菜地里，要浇两天水才长出一个大南瓜。')),
  carrot: I($t('胡萝卜'), 8, 'crop', 0, $t('兔子最爱吃。别的岛也收。')),
  wheat: I($t('小麦'), 6, 'crop', 0, $t('羊和鸡爱吃。')),
  strawberry: I($t('草莓'), 14, 'crop', 0, $t('狐狸爱吃。甜。')),
  pumpkin: I($t('南瓜'), 40, 'crop', 1, $t('个头大，值钱。山羊爱吃。')),
  // what pets bring
  egg: I($t('鸡蛋'), 6, 'material', 0, $t('鸡下的。')),
  wool: I($t('羊毛'), 10, 'material', 0, $t('羊身上剪的。能直接织帆布。')),
  // dyes: what paint jobs are made of (each recipe makes two)
  dyeRed: I($t('红颜料'), 6, 'part', 0, $t('野花磨的。涂装用。')),
  dyeYellow: I($t('黄颜料'), 6, 'part', 0, $t('麦子和野花熬的。涂装用。')),
  dyeBlue: I($t('蓝颜料'), 10, 'part', 0, $t('铜矿和贝壳磨的。涂装用。')),
  dyeGreen: I($t('绿颜料'), 6, 'part', 0, $t('纤维泡的。涂装用。')),
  dyeWhite: I($t('白颜料'), 6, 'part', 0, $t('贝壳磨的。涂装用；补漆也用它。')),
  dyeBlack: I($t('黑颜料'), 6, 'part', 0, $t('煤磨的。涂装用。')),
  dyePink: I($t('粉颜料'), 10, 'part', 0, $t('草莓和贝壳调的。涂装用。')),
  dyeSilver: I($t('银颜料'), 40, 'part', 1, $t('珍珠磨的。涂装用，闪闪发亮。')),
  pack1: I($t('草编背包'), 20, 'gear', 0, $t('背上就多 8 格。纤维编的，轻。')),
  pack2: I($t('帆布背包'), 80, 'gear', 1, $t('再多 8 格。远航的人都背一个。')),
  pack3: I($t('远航背包'), 240, 'gear', 2, $t('再多 8 格，一共 32 格。铁扣、贝壳扣，结实。')),
  smoke: I($t('烟幕弹'), 18, 'gear', 0, $t('被海盗盯上时放一颗：它会跟丢好几秒。一次用掉一颗。')),
  // furniture: placed on the island
  bench: I($t('长椅'), 24, 'furniture', 0, $t('坐下看海。')),
  flowerBed: I($t('花坛'), 22, 'furniture', 0, $t('石头垒的一圈花。')),
  lampPost: I($t('路灯'), 40, 'furniture', 0, $t('入夜会亮。')),
  flag: I($t('旗杆'), 30, 'furniture', 0, $t('让来送货的人老远就认出你的岛。')),
  table: I($t('野餐桌'), 34, 'furniture', 0, $t('松木的，带两条凳。')),
  chime: I($t('贝壳风铃'), 60, 'furniture', 1, $t('挂在木架上，叮叮当当。')),
  fishRack: I($t('晒鱼架'), 30, 'furniture', 1, $t('把你钓过的最大的鱼晾出来：旁边的小牌子写着鱼名、多长、哪天钓的。')),
  trophy: I($t('金枪鱼标本'), 180, 'furniture', 2, $t('钓到过大鱼的证明。')),
  crystalLamp: I($t('水晶灯'), 240, 'furniture', 2, $t('水晶做的，自己会发光。')),
  goldStatue: I($t('金雕像'), 420, 'furniture', 2, $t('一架金色的小飞机。')),
  fountain: I($t('月光喷泉'), 900, 'furniture', 3, $t('月光石砌的。整座岛都会不一样。')),
  keeperLamp: I($t('守灯人的提灯'), 0, 'furniture', 3, $t('从海的那一边带回来的。夜里，它替你亮着。')),
  // the house, inside (the first set comes with the house; more are made at the workbench)
  bed: I($t('床'), 30, 'furniture', 0, $t('睡一觉，体力就回满了。晚上才睡得着。')),
  wardrobe: I($t('衣柜'), 24, 'furniture', 0, $t('在衣柜前换衣服、换发型。')),
  toilet: I($t('马桶'), 20, 'furniture', 0, $t('每个家都得有一个。')),
  sink: I($t('洗手台'), 18, 'furniture', 0, $t('洗洗手，照照镜子。')),
  shower: I($t('淋浴间'), 40, 'furniture', 0, $t('每天冲一次热水澡，回一点体力。')),
  bathtub: I($t('浴缸'), 60, 'furniture', 1, $t('泡一泡，比淋浴回得多。')),
  stove: I($t('灶台'), 36, 'furniture', 0, $t('做饭的地方。做熟的东西比生吃顶饿得多。')),
  fridge: I($t('冰箱'), 40, 'furniture', 0, $t('里面连着仓库。')),
  counter: I($t('橱柜'), 16, 'furniture', 0, $t('切菜的台面。')),
  dinnerTable: I($t('餐桌'), 20, 'furniture', 0, $t('一家人吃饭的桌子。')),
  chair: I($t('椅子'), 8, 'furniture', 0, $t('坐下歇一会儿，慢慢回体力。')),
  sofa: I($t('沙发'), 36, 'furniture', 0, $t('坐下歇一会儿，慢慢回体力。')),
  tv: I($t('电视柜'), 50, 'furniture', 1, $t('每晚播明天的天气。')),
  coffeeTable: I($t('茶几'), 14, 'furniture', 0, $t('会客时摆茶的小桌。')),
  rug: I($t('地毯'), 16, 'furniture', 0, $t('软软的。')),
  bookshelf: I($t('书架'), 26, 'furniture', 0, $t('放着航海日志和图鉴。')),
  pottedPlant: I($t('盆栽'), 12, 'furniture', 0, $t('屋里也要有点绿。')),
  floorLamp: I($t('落地灯'), 22, 'furniture', 0, $t('夜里亮着暖黄的光。')),
  desk: I($t('岛务桌'), 20, 'furniture', 0, $t('在这里看岛的等级、动物和装扮。')),
  fireplace: I($t('壁炉'), 60, 'furniture', 1, $t('噼啪作响。下雨下雪的晚上，躺在床上听着最好。')),
  // round 11: much more for the house — tables, seats, cabinets, lamps, rugs, things for the walls and for tabletops
  roundTable: I($t('圆桌'), 24, 'furniture', 0, $t('四个人围着坐正好。桌上能摆东西。')),
  sideTable: I($t('边几'), 12, 'furniture', 0, $t('沙发边上放杯茶。')),
  nightstand: I($t('床头柜'), 14, 'furniture', 0, $t('放在床边，摆盏台灯。')),
  longTable: I($t('长木桌'), 30, 'furniture', 0, $t('长长的一张，能摆一排东西。')),
  armchair: I($t('扶手椅'), 30, 'furniture', 0, $t('陷进去就不想起来。')),
  stool: I($t('圆凳'), 8, 'furniture', 0, $t('小小一个。')),
  rockingChair: I($t('摇椅'), 40, 'furniture', 1, $t('坐上去会慢慢摇。')),
  cushion: I($t('坐垫'), 8, 'furniture', 0, $t('放地毯上，盘腿坐。')),
  bigPillow: I($t('大抱枕'), 14, 'furniture', 0, $t('靠着它窝一会儿。')),
  beanbag: I($t('懒人沙发'), 26, 'furniture', 0, $t('一坐就陷进去。')),
  doubleBed: I($t('双人床'), 60, 'furniture', 1, $t('又大又软。')),
  dresser: I($t('五斗柜'), 30, 'furniture', 0, $t('上面能摆东西。')),
  cupboard: I($t('碗柜'), 32, 'furniture', 0, $t('玻璃门后面是碗碟。')),
  wallShelf: I($t('墙上搁板'), 12, 'furniture', 0, $t('挂在墙上。')),
  tableLamp: I($t('台灯'), 14, 'furniture', 0, $t('摆在桌上，晚上亮。')),
  wallLamp: I($t('壁灯'), 14, 'furniture', 0, $t('挂在墙上，晚上亮。')),
  stringLights: I($t('串灯'), 18, 'furniture', 1, $t('一串小灯泡，晚上一闪一闪。')),
  candle: I($t('蜡烛'), 6, 'furniture', 0, $t('摆在桌上，火苗轻轻晃。')),
  roundRug: I($t('圆地毯'), 18, 'furniture', 0, $t('软软的，圆的。')),
  runnerRug: I($t('长条地毯'), 16, 'furniture', 0, $t('铺在走道上。')),
  paintingSea: I($t('海景画'), 30, 'furniture', 1, $t('挂在墙上。')),
  paintingFlower: I($t('花的画'), 22, 'furniture', 0, $t('挂在墙上。')),
  chartFrame: I($t('海图画框'), 34, 'furniture', 1, $t('挂在墙上。')),
  wallClock: I($t('挂钟'), 18, 'furniture', 0, $t('滴答滴答。')),
  curtains: I($t('窗帘'), 16, 'furniture', 0, $t('挂在窗户上。')),
  mirror: I($t('镜子'), 18, 'furniture', 0, $t('挂在墙上。')),
  bigPlant: I($t('大盆栽'), 22, 'furniture', 0, $t('一人高的一盆绿。')),
  cactus: I($t('仙人掌'), 6, 'furniture', 0, $t('摆在桌上。不用浇水。')),
  hangingPlant: I($t('吊兰'), 12, 'furniture', 0, $t('挂在墙上。')),
  flowerVase: I($t('花瓶'), 10, 'furniture', 0, $t('摆在桌上。')),
  bookStack: I($t('一摞书'), 6, 'furniture', 0, $t('摆在桌上。')),
  teaSet: I($t('茶具'), 14, 'furniture', 0, $t('摆在桌上。')),
  fishbowl: I($t('金鱼缸'), 20, 'furniture', 0, $t('摆在桌上，里面游着一条小鱼。')),
  globe: I($t('地球仪'), 16, 'furniture', 0, $t('摆在桌上。')),
  aquarium: I($t('鱼缸'), 80, 'furniture', 1, $t('你钓到、潜到的鱼会在里面游。')),
  fishPlaque: I($t('鱼标本'), 20, 'furniture', 1, $t('挂在墙上：你钓到过的最大的一条。')),
  stockMachine: I($t('炒股机'), 80, 'furniture', 1, $t('一台绿屏的老终端。点它买卖各岛公司的股票：股价跟着天气、季节和你送的货变。')),
  computer: I($t('旧电脑'), 120, 'furniture', 1, $t('放在书桌上的老电脑：股市、信箱、天气、图鉴、相册，还有扫雷。')),
  woodStove: I($t('小火炉'), 60, 'furniture', 1, $t('铸铁的小炉子，炉门里一直有火光。下雨天守着它最好。')),
  photoFrame: I($t('相框'), 20, 'furniture', 0, $t('挂在墙上，点它从相册里挑一张照片放进去。')),
  guestbook: I($t('留言本'), 24, 'furniture', 0, $t('摆在桌上。来家里坐过的客人会在上面写一句。')),
  homeBench: I($t('家用工作台'), 80, 'furniture', 1, $t('工坊里的大台子。在家就能做东西，不用跑去外面的工作台。')),
  planter: I($t('花盆架'), 30, 'furniture', 0, $t('温室里的种植架。每天早上都能摘到一点东西。')),
  telescope: I($t('望远镜'), 120, 'furniture', 2, $t('黄铜的。夜里对着天看，每晚能认出一个星座。')),
  pool: I($t('泳池'), 200, 'furniture', 2, $t('露台上的一池海水。泡一会儿，体力回来一些。')),
  deckChair: I($t('躺椅'), 26, 'furniture', 0, $t('帆布的，放在泳池边上。')),
  beacon: I($t('灯塔灯'), 300, 'furniture', 3, $t('灯室里的大灯。点亮它，夜里送货多拿一成。')),
  // the kitchen: cooked food fills you up for longer and gives back more of your strength
  grilledFish: I($t('烤鱼'), 20, 'food', 0, $t('烤得焦香。')),
  fishSoup: I($t('鲜鱼汤'), 36, 'food', 0, $t('一碗下肚，浑身暖和。')),
  carrotSoup: I($t('胡萝卜汤'), 30, 'food', 0, $t('甜甜的。')),
  bread: I($t('面包'), 20, 'food', 0, $t('刚出炉的，麦香。')),
  omelette: I($t('煎蛋'), 16, 'food', 0, $t('最快的一顿饭。')),
  pumpkinSoup: I($t('南瓜浓汤'), 60, 'food', 1, $t('浓得能立住勺子。')),
  berryJam: I($t('浆果果酱'), 24, 'food', 0, $t('抹面包最好。')),
  strawberryPie: I($t('草莓派'), 80, 'food', 1, $t('一整天都有劲。')),
  seafoodFeast: I($t('海鲜大餐'), 160, 'food', 2, $t('龙虾和章鱼，一顿顶一天。')),
  grilledSquid: I($t('烤鱿鱼'), 50, 'food', 1, $t('嚼劲十足。')),
  sashimi: I($t('金枪鱼刺身'), 80, 'food', 2, $t('切得薄薄的，最新鲜的吃法。')),
} satisfies Record<string, ItemDef>

export type ItemId = keyof typeof ITEM_TABLE
export const ITEMS: Record<ItemId, ItemDef> = ITEM_TABLE
export const ITEM_ORDER = Object.keys(ITEMS) as ItemId[]
export type Bag = Partial<Record<ItemId, number>>

// ───────────────────────────────────────────────────────────── tools
export type ToolKind = 'axe' | 'pick'
export const TOOLS: Record<ToolKind, ItemId[]> = { axe: ['stoneAxe', 'copperAxe', 'ironAxe'], pick: ['stonePick', 'copperPick', 'ironPick'] }
/** the best tool of a kind in the bag: 0 none · 1 stone · 2 copper · 3 iron */
export function toolTier(inv: Bag, kind: ToolKind): number {
  const list = TOOLS[kind]
  for (let t = list.length; t >= 1; t--) if ((inv[list[t - 1]] ?? 0) > 0) return t
  return 0
}
export function toolName(kind: ToolKind, tier: number): string {
  return ITEMS[TOOLS[kind][Math.max(1, tier) - 1]].name
}

// ───────────────────────────────────────────────────────────── resource nodes
export type NodeKind =
  | 'oak1' | 'oak2' | 'oak3' | 'apple2' | 'birch2' | 'pine1' | 'pine2' | 'pine3' | 'palm1' | 'palm2'
  | 'boulderS' | 'boulder' | 'oreCopper' | 'oreCoal' | 'oreIron'
  | 'bushBerry' | 'flax' | 'flower' | 'stick' | 'pebble' | 'shell'

export interface NodeDef {
  name: string
  verb: string
  /** the prop it is drawn as, and what is left when it has been taken (null: nothing) */
  model: string
  empty: string | null
  /** what it takes: bare hands, or an axe / a pick of at least this tier */
  tool: ToolKind | 'hand'
  tier: number
  /** how tough it is: blows needed = hp / the tool's tier */
  hp: number
  swing: number
  yield: Bag
  /** now and then, something extra: [item, chance] */
  bonus?: [ItemId, number][]
  regrow: number
  sound: string
  chips: string
  /** a tree: it sways when struck and falls at the end */
  tall?: boolean
  /** half-width of what blocks the way (0: can be walked over) */
  solid: number
}
const tree = (name: string, model: string, empty: string, tier: number, hp: number, y: Bag, chips: string, solid: number, bonus?: [ItemId, number][]): NodeDef =>
  ({ name, verb: $t('砍'), model, empty, tool: 'axe', tier, hp, swing: 0.46, yield: y, bonus, regrow: 150, sound: 'chop', chips, tall: true, solid })
const rock = (name: string, model: string, tier: number, hp: number, y: Bag, chips: string, solid: number, bonus?: [ItemId, number][]): NodeDef =>
  ({ name, verb: $t('挖'), model, empty: 'rubble', tool: 'pick', tier, hp, swing: 0.5, yield: y, bonus, regrow: 240, sound: 'mine', chips, solid })
const pickup = (name: string, model: string, empty: string | null, y: Bag, regrow: number, chips: string, solid = 0): NodeDef =>
  ({ name, verb: $t('采'), model, empty, tool: 'hand', tier: 0, hp: 1, swing: 0.36, yield: y, regrow, sound: 'pick', chips, solid })

export const NODES: Record<NodeKind, NodeDef> = {
  oak1: tree($t('小橡树'), 'oak1', 'stump1', 1, 3, { wood: 2 }, 'wood', 1),
  oak2: tree($t('橡树'), 'oak2', 'stump2', 1, 5, { wood: 4 }, 'wood', 1, [['stick', 0.5], ['acorn', 0.35]]),
  oak3: tree($t('老橡树'), 'oak3', 'stump3', 2, 10, { wood: 9 }, 'wood', 2, [['stick', 1], ['acorn', 0.8]]),
  apple2: tree($t('果树'), 'apple2', 'stump2', 1, 5, { wood: 3, berry: 2 }, 'wood', 1),
  birch2: tree($t('白桦'), 'birch2', 'stump2', 1, 4, { wood: 3 }, 'wood', 1, [['fiber', 0.5]]),
  pine1: tree($t('小松树'), 'pine1', 'stump1', 1, 3, { pine: 2 }, 'wood', 1),
  pine2: tree($t('松树'), 'pine2', 'stump2', 1, 6, { pine: 4 }, 'wood', 1),
  pine3: tree($t('老松'), 'pine3', 'stump3', 2, 11, { pine: 9 }, 'wood', 2),
  palm1: tree($t('小棕榈'), 'palm1', 'stumpPalm', 1, 3, { palm: 2 }, 'wood', 1),
  palm2: tree($t('棕榈'), 'palm2', 'stumpPalm', 1, 5, { palm: 4 }, 'wood', 1, [['fiber', 0.6]]),
  boulderS: rock($t('石块'), 'boulderS', 1, 3, { stone: 2 }, 'rock', 3),
  boulder: rock($t('巨石'), 'boulder', 1, 6, { stone: 5 }, 'rock', 5, [['coal', 0.35]]),
  oreCopper: rock($t('铜矿露头'), 'ore_copper', 1, 5, { copperOre: 2, stone: 1 }, 'copper', 6),
  oreCoal: rock($t('煤层露头'), 'ore_coal', 1, 4, { coal: 2, stone: 1 }, 'coal', 6),
  oreIron: rock($t('铁矿露头'), 'ore_iron', 2, 8, { ironOre: 2, stone: 1 }, 'iron', 6),
  bushBerry: { ...pickup($t('浆果丛'), 'bushBerry', 'bushBare', { berry: 2 }, 100, 'leaf', 3), bonus: [['berrySeed', 0.25]] },
  flax: { ...pickup($t('亚麻丛'), 'flax', 'flaxCut', { fiber: 2 }, 70, 'leaf'), bonus: [['flaxSeed', 0.3]] },
  flower: pickup($t('野花'), 'flower', null, { flower: 1 }, 140, 'flower'),
  stick: pickup($t('树枝'), 'stick', null, { stick: 1 }, 80, 'wood'),
  pebble: pickup($t('卵石'), 'pebble', null, { pebble: 1 }, 80, 'rock'),
  shell: pickup($t('贝壳'), 'shell', null, { shell: 1 }, 160, 'dust'),
}

/** what grows from a seed set in the ground on the player's own island, and how long it takes (seconds) */
export const PLANTS: Partial<Record<ItemId, { node: NodeKind; grow: number }>> = {
  acorn: { node: 'oak2', grow: 240 },
  berrySeed: { node: 'bushBerry', grow: 150 },
  flaxSeed: { node: 'flax', grow: 100 },
}
export const MAX_PLANTS = 16

// ───────────────────────────────────────────────────────────── eating
/** what eating one gives back: strength now, and how full it leaves you (both out of 100) */
export const FOOD: Partial<Record<ItemId, { energy: number; full: number }>> = {
  berry: { energy: 4, full: 6 },
  carrot: { energy: 6, full: 10 },
  strawberry: { energy: 6, full: 8 },
  pumpkin: { energy: 12, full: 22 },
  egg: { energy: 4, full: 6 },
  grilledFish: { energy: 22, full: 28 },
  fishSoup: { energy: 34, full: 40 },
  carrotSoup: { energy: 28, full: 34 },
  bread: { energy: 20, full: 36 },
  omelette: { energy: 16, full: 20 },
  pumpkinSoup: { energy: 45, full: 55 },
  berryJam: { energy: 18, full: 14 },
  strawberryPie: { energy: 60, full: 60 },
  seafoodFeast: { energy: 100, full: 90 },
  grilledSquid: { energy: 30, full: 30 },
  sashimi: { energy: 50, full: 40 },
}
/** cooking at the stove: what goes in */
export const DISHES: { out: ItemId; cost: Bag }[] = [
  { out: 'omelette', cost: { egg: 2 } },
  { out: 'grilledFish', cost: { sardine: 2 } },
  { out: 'bread', cost: { wheat: 3 } },
  { out: 'berryJam', cost: { berry: 5 } },
  { out: 'carrotSoup', cost: { carrot: 2, fiber: 1 } },
  { out: 'fishSoup', cost: { bream: 1, carrot: 1 } },
  { out: 'pumpkinSoup', cost: { pumpkin: 1, egg: 1 } },
  { out: 'strawberryPie', cost: { strawberry: 3, wheat: 2, egg: 1 } },
  { out: 'seafoodFeast', cost: { lobster: 1, octopus: 1, mackerel: 1 } },
  { out: 'grilledSquid', cost: { squid: 1 } },
  { out: 'sashimi', cost: { tuna: 1 } },
]
/** what work takes out of you (out of 100) */
// round 15: about half what it was — a day's work leaves you tired by evening, not by noon
export const EFFORT = { chop: 1, mine: 1, cast: 1.5, net: 0.5, harpoon: 1, shovel: 2, hand: 0.5 }

// ───────────────────────────────────────────────────────────── recipes
export type Station = 'workbench' | 'furnace'
export type RecipeTab = 'tools' | 'parts' | 'gear' | 'paint' | 'furniture'
export interface Recipe {
  id: string
  station: Station
  tab: RecipeTab
  out: ItemId
  qty: number
  cost: Bag
  /** seconds per batch: a short job of hammering at the workbench, a slow burn in the furnace */
  time: number
  /** a tool or a piece of gear: one is enough, so it can only be made once */
  once?: boolean
  /** the island level it can be made from */
  level?: number
}
const R = (out: ItemId, tab: RecipeTab, cost: Bag, once = false): Recipe => ({ id: out, station: 'workbench', tab, out, qty: 1, cost, time: 0, once })
const S = (out: ItemId, cost: Bag, time: number): Recipe => ({ id: out, station: 'furnace', tab: 'parts', out, qty: 1, cost, time })
export const RECIPES: Recipe[] = [
  R('stoneAxe', 'tools', { stick: 2, pebble: 2, fiber: 1 }, true),
  R('stonePick', 'tools', { stick: 2, pebble: 3, fiber: 1 }, true),
  R('rod', 'tools', { stick: 3, rope: 1 }, true),
  R('copperAxe', 'tools', { copperIngot: 2, stick: 2 }, true),
  R('copperPick', 'tools', { copperIngot: 3, stick: 2 }, true),
  R('ironAxe', 'tools', { ironIngot: 2, plank: 1 }, true),
  R('ironPick', 'tools', { ironIngot: 3, plank: 1 }, true),
  R('plank', 'parts', { wood: 2 }),
  R('cloth', 'parts', { fiber: 3 }),
  R('rope', 'parts', { fiber: 2 }),
  R('furnaceKit', 'parts', { stone: 8, wood: 2 }),
  R('restaurantKit', 'parts', { plank: 12, stone: 8, cloth: 4, copperIngot: 2 }, true),
  { ...R('ranchKit', 'parts', { plank: 30, stone: 10, wheat: 10, rope: 4 }, true), level: 6 },
  { ...R('shopKit', 'parts', { plank: 24, stone: 16, cloth: 8, copperIngot: 4 }, true), level: 7 },
  { ...R('depotKit', 'parts', { plank: 30, stone: 20, ironIngot: 12, rope: 8 }, true), level: 8 },
  { ...R('lighthouseKit', 'parts', { stone: 60, ironIngot: 10, goldIngot: 2, crystal: 3 }, true), level: 9 },
  { ...R('exchangeKit', 'parts', { stone: 60, plank: 20, goldIngot: 4, crystal: 4 }, true), level: 10 },
  R('seaChart', 'parts', { chartPiece: 4, cloth: 1 }, true),
  R('lantern', 'gear', { copperIngot: 1, coal: 2 }, true),
  R('smoke', 'gear', { coal: 2, cloth: 1 }),
  { ...R('dyeRed', 'paint', { flower: 2 }), qty: 2 },
  { ...R('dyeYellow', 'paint', { wheat: 1, flower: 1 }), qty: 2 },
  { ...R('dyeBlue', 'paint', { copperOre: 1, shell: 1 }), qty: 2 },
  { ...R('dyeGreen', 'paint', { fiber: 3 }), qty: 2 },
  { ...R('dyeWhite', 'paint', { shell: 2 }), qty: 2 },
  { ...R('dyeBlack', 'paint', { coal: 2 }), qty: 2 },
  { ...R('dyePink', 'paint', { strawberry: 1, shell: 1 }), qty: 2 },
  { ...R('dyeSilver', 'paint', { pearl: 1 }), qty: 2 },
  R('pack1', 'gear', { fiber: 8, stick: 4 }, true),
  R('creel', 'gear', { fiber: 6, stick: 3 }, true),
  { ...R('net', 'tools', { stick: 3, fiber: 6 }, true), level: 2 },
  { ...R('cloth', 'parts', { wool: 2 }), id: 'clothWool' },
  R('pack2', 'gear', { cloth: 4, rope: 3 }, true),
  R('pack3', 'gear', { cloth: 6, ironIngot: 2, shell: 4 }, true),
  R('harpoon', 'gear', { copperIngot: 2, rope: 2, plank: 1 }, true),
  R('tank', 'gear', { copperIngot: 4, cloth: 1 }, true),
  R('bench', 'furniture', { plank: 3 }),
  R('flowerBed', 'furniture', { stone: 4, flower: 3 }),
  R('table', 'furniture', { pine: 6 }),
  R('flag', 'furniture', { plank: 2, cloth: 1 }),
  R('lampPost', 'furniture', { copperIngot: 1, coal: 1, plank: 1 }),
  R('chime', 'furniture', { shell: 5, rope: 1, palm: 2 }),
  R('fishRack', 'furniture', { plank: 3, rope: 1 }),
  R('trophy', 'furniture', { tuna: 1, plank: 2 }),
  R('shovel', 'tools', { stick: 2, pebble: 2 }, true),
  R('wateringCan', 'tools', { plank: 1, copperIngot: 1 }, true),
  R('chair', 'furniture', { plank: 2 }),
  R('coffeeTable', 'furniture', { plank: 3 }),
  R('bookshelf', 'furniture', { plank: 5 }),
  R('pottedPlant', 'furniture', { flower: 2, stone: 2 }),
  R('rug', 'furniture', { cloth: 3 }),
  R('floorLamp', 'furniture', { copperIngot: 1, cloth: 1 }),
  R('sofa', 'furniture', { plank: 3, cloth: 3 }),
  R('dinnerTable', 'furniture', { plank: 4 }),
  R('wardrobe', 'furniture', { plank: 6 }),
  R('bathtub', 'furniture', { stone: 8, copperIngot: 2 }),
  R('tv', 'furniture', { copperIngot: 3, crystal: 1, plank: 2 }),
  R('fireplace', 'furniture', { stone: 12, copperIngot: 1 }),
  R('computer', 'furniture', { plank: 2, copperIngot: 3, crystal: 1 }),
  { ...R('breadBait', 'gear', { wheat: 1 }), qty: 4 },
  { ...R('squidBait', 'gear', { squid: 1 }), qty: 4 },
  R('spinner', 'gear', { copperIngot: 1, rope: 1 }, true),
  R('softLure', 'gear', { fiber: 2, berry: 2 }, true),
  R('glowLure', 'gear', { copperIngot: 1, pearl: 1 }, true),
  R('roundTable', 'furniture', { plank: 4 }),
  R('sideTable', 'furniture', { plank: 2 }),
  R('nightstand', 'furniture', { plank: 3 }),
  R('longTable', 'furniture', { plank: 6 }),
  R('armchair', 'furniture', { plank: 3, cloth: 3 }),
  R('stool', 'furniture', { plank: 1 }),
  R('rockingChair', 'furniture', { plank: 5, cloth: 1 }),
  R('cushion', 'furniture', { cloth: 2 }),
  R('bigPillow', 'furniture', { cloth: 3 }),
  R('beanbag', 'furniture', { cloth: 4, fiber: 4 }),
  R('doubleBed', 'furniture', { plank: 6, cloth: 4 }),
  R('dresser', 'furniture', { plank: 5 }),
  R('cupboard', 'furniture', { plank: 5, shell: 2 }),
  R('wallShelf', 'furniture', { plank: 2 }),
  R('tableLamp', 'furniture', { copperIngot: 1, cloth: 1 }),
  R('wallLamp', 'furniture', { copperIngot: 1, cloth: 1 }),
  R('stringLights', 'furniture', { copperIngot: 1, fiber: 2 }),
  R('candle', 'furniture', { fiber: 2 }),
  R('roundRug', 'furniture', { cloth: 3 }),
  R('runnerRug', 'furniture', { cloth: 2 }),
  R('paintingSea', 'furniture', { plank: 1, cloth: 1, dyeBlue: 1 }),
  R('paintingFlower', 'furniture', { plank: 1, cloth: 1, dyeRed: 1 }),
  R('chartFrame', 'furniture', { plank: 2, cloth: 1 }),
  R('wallClock', 'furniture', { plank: 1, copperIngot: 1 }),
  R('curtains', 'furniture', { cloth: 3 }),
  R('mirror', 'furniture', { plank: 1, shell: 3 }),
  R('bigPlant', 'furniture', { stone: 3, fiber: 4 }),
  R('cactus', 'furniture', { stone: 1, fiber: 1 }),
  R('hangingPlant', 'furniture', { fiber: 3, rope: 1 }),
  R('flowerVase', 'furniture', { stone: 1, flower: 2 }),
  R('bookStack', 'furniture', { plank: 1 }),
  R('teaSet', 'furniture', { stone: 2 }),
  R('fishbowl', 'furniture', { shell: 2, sardine: 1 }),
  R('globe', 'furniture', { plank: 1, copperIngot: 1 }),
  R('aquarium', 'furniture', { plank: 2, copperIngot: 2, shell: 4 }),
  R('fishPlaque', 'furniture', { plank: 2 }),
  R('woodStove', 'furniture', { ironIngot: 2, stone: 2 }),
  R('photoFrame', 'furniture', { plank: 1 }),
  R('guestbook', 'furniture', { plank: 1, cloth: 1 }),
  R('planter', 'furniture', { plank: 4, stone: 2 }),
  R('deckChair', 'furniture', { plank: 2, cloth: 2 }),
  R('crystalLamp', 'furniture', { crystal: 2, copperIngot: 1 }),
  R('goldStatue', 'furniture', { goldIngot: 3, stone: 4 }),
  R('fountain', 'furniture', { moonstone: 1, pearl: 2, stone: 12 }),
  S('copperIngot', { copperOre: 2, wood: 1 }, 5),
  S('ironIngot', { ironOre: 2, coal: 1 }, 8),
  S('goldIngot', { goldOre: 2, coal: 1 }, 11),
]
export const RECIPE_TABS: [RecipeTab, string][] = [['tools', $t('工具')], ['parts', $t('材料')], ['gear', $t('装备')], ['paint', $t('颜料')], ['furniture', $t('家具')]]
/** the dyes, in the order of the paint colours (DESIGN_COLOURS in engine/craft.ts) */
export const DYES: ItemId[] = ['dyeRed', 'dyeYellow', 'dyeBlue', 'dyeGreen', 'dyeWhite', 'dyeBlack', 'dyePink', 'dyeSilver']
/** how many uses a tool has in it before it breaks, and what mends it at the workbench */
export const TOOL_USES: Partial<Record<ItemId, number>> = { stoneAxe: 40, stonePick: 40, copperAxe: 120, copperPick: 120, ironAxe: 300, ironPick: 300, rod: 60, net: 60, harpoon: 80, shovel: 60 }
export const TOOL_MEND: Partial<Record<ItemId, Bag>> = {
  stoneAxe: { stick: 1, pebble: 1 }, stonePick: { stick: 1, pebble: 1 }, copperAxe: { copperIngot: 1 }, copperPick: { copperIngot: 1 },
  ironAxe: { ironIngot: 1 }, ironPick: { ironIngot: 1 }, rod: { stick: 1, rope: 1 }, net: { fiber: 2 }, harpoon: { rope: 1, copperIngot: 1 }, shovel: { stick: 1, pebble: 1 },
}

// ───────────────────────────────────────────────────────────── vehicles
// Ten levels of plane and of boat, in four generations of hull. A hull is upgraded in place
// within its generation (a raft becomes a sail-raft becomes a skiff, and stops there); the next
// generation is a new build — and a new paint job. See docs/CHANGES-R6.md.
export type VehicleId = 'sparrow' | 'skiff' | 'biplane' | 'sloop' | 'falcon' | 'freighter' | 'flagship' | 'airship'
export interface VehicleDef {
  name: string
  kind: 'plane' | 'boat'
  /** which model it is drawn with, and at what size */
  model: string
  scale: number
  flames: boolean
  desc: string
  cost: Bag
  /** how many units of goods it carries */
  cargo: number
  /** how high its middle sits above the ground (or the water) when parked */
  rest: number
  /**
   * Handling: the prototype's flight model, with different numbers. speed px/s · boost × while
   * the thrusters are held · agility rad/s · bank ° · altitude: cruising height
   */
  flight: { speed: number; boost: number; agility: number; bank: number; altitude: number; ceiling: number; clearance: number }
  /** its level, 1–10, and the hull generation's last level (where upgrading in place stops) */
  lv: number
  top: number
  /** how much a pirate has to work to get the goods (1 = plain) */
  armor: number
  /** the island level it needs (a bigger yard for a bigger hull) */
  island: number
  planned?: boolean
}
export interface HullLevel { lv: number; name: string; model: string; scale: number; cargo: number; speed: number; agility: number; armor: number; desc: string
  /** to build it (the generation's first level) or to upgrade to it (the others) */
  cost: Bag; coins: number; island: number; planned?: boolean }
export interface Hull { kind: 'plane' | 'boat'; gen: number; flames: boolean; rest: number; base: VehicleDef['flight']; levels: HullLevel[] }
const PLANE = { boost: 1.6, bank: 40, altitude: 74, ceiling: 170, clearance: 9 }
const BOAT = { boost: 1.6, bank: 7, altitude: 0, ceiling: 0, clearance: 2 }
const L = (lv: number, name: string, model: string, scale: number, cargo: number, speed: number, agility: number, armor: number, cost: Bag, coins: number, island: number, desc: string, planned = false): HullLevel =>
  ({ lv, name, model, scale, cargo, speed, agility, armor, cost, coins, island, desc, planned })
export const HULLS: Record<VehicleId, Hull> = {
  sparrow: { kind: 'plane', gen: 1, flames: false, rest: 3.5, base: { speed: 54, agility: 1.5, ...PLANE }, levels: [
    L(1, $t('木架飞机'), 'kite', 1.15, 6, 46, 1.4, 1, { plank: 6, copperIngot: 2, cloth: 2 }, 0, 1, $t('木头骨架、帆布机翼、一台小发动机。慢，装得少，但它是你亲手造的。')),
    L(2, $t('麻雀号'), 'sparrow', 1.15, 8, 54, 1.5, 1, { copperIngot: 3, plank: 2, cloth: 1 }, 120, 1, $t('换上铜蒙皮和封闭座舱：快了一截，货舱大了一点。')),
    L(3, $t('改装麻雀'), 'sparrow3', 1.2, 10, 60, 1.6, 1.2, { ironIngot: 3, copperIngot: 2 }, 300, 2, $t('加长机翼、铁骨架：第一代飞机能做到的最好。')),
  ] },
  skiff: { kind: 'boat', gen: 1, flames: false, rest: 1, base: { speed: 36, agility: 1.0, ...BOAT }, levels: [
    L(1, $t('筏子'), 'raft', 1.15, 14, 28, 0.9, 1, { wood: 12, rope: 3 }, 0, 1, $t('几根木头捆在一起。只能划，但能装，而且不用金属。')),
    L(2, $t('帆筏'), 'sailraft', 1.15, 18, 32, 0.95, 1, { plank: 4, cloth: 2, rope: 1 }, 80, 1, $t('竖起一根桅杆、挂一张帆：顺风时快多了。')),
    L(3, $t('舢板'), 'skiff', 1.15, 24, 36, 1.0, 1.1, { plank: 8, cloth: 2, rope: 2 }, 200, 2, $t('真正的船身：第一代船能做到的最好。')),
  ] },
  biplane: { kind: 'plane', gen: 2, flames: false, rest: 4, base: { speed: 66, agility: 1.5, ...PLANE }, levels: [
    L(4, $t('双翼货机'), 'biplane', 1.1, 16, 66, 1.5, 1.3, { ironIngot: 6, copperIngot: 4, plank: 6, cloth: 4 }, 800, 5, $t('1920 年代的样子：两层机翼、支柱、星形发动机，大货舱。第二代的开始，要重新造，也要重新涂装。')),
    L(5, $t('双翼快机'), 'biplane5', 1.1, 18, 72, 1.6, 1.4, { ironIngot: 4, copperIngot: 3, cloth: 2 }, 500, 5, $t('发动机套上整流环，机腹挂一个货仓：快了，也多装两格。')),
    L(6, $t('双翼水上机'), 'biplane6', 1.15, 22, 74, 1.6, 1.6, { ironIngot: 5, plank: 8, rope: 3 }, 900, 6, $t('轮子换成两只浮筒：第二代飞机能做到的最好。')),
  ] },
  sloop: { kind: 'boat', gen: 2, flames: false, rest: 1, base: { speed: 42, agility: 1.0, ...BOAT }, levels: [
    L(4, $t('单桅帆船'), 'sloop', 1.0, 40, 42, 1.0, 1.4, { plank: 16, cloth: 6, rope: 4, ironIngot: 3 }, 700, 5, $t('一面大帆、一间船舱：第二代的开始。要重新造，也要重新涂装。')),
    L(5, $t('双桅帆船'), 'brig', 1.0, 48, 46, 1.0, 1.5, { plank: 12, cloth: 6, rope: 4 }, 450, 5, $t('再竖一根桅：两面方帆，顺风时快得多。')),
    L(6, $t('货运帆船'), 'cargosail', 1.0, 60, 47, 0.95, 1.7, { plank: 20, ironIngot: 4, rope: 6 }, 800, 6, $t('船身加宽，甲板上码满货：第二代船能做到的最好。')),
  ] },
  // (the id is the old jet's, so saves that had one keep a plane of this generation)
  falcon: { kind: 'plane', gen: 3, flames: false, rest: 3.5, base: { speed: 82, agility: 1.35, ...PLANE }, levels: [
    L(7, $t('银翼'), 'silver7', 0.95, 28, 82, 1.35, 1.8, { ironIngot: 12, copperIngot: 8, goldIngot: 1, crystal: 2 }, 1600, 7, $t('流线型、全金属、单翼、两台发动机、双垂尾：第三代的开始。')),
    L(8, $t('银翼货机'), 'silver8', 0.95, 34, 84, 1.35, 2, { ironIngot: 10, copperIngot: 6, goldIngot: 2 }, 2200, 8, $t('机身加长，尾部开了货门。')),
    L(9, $t('大型货机'), 'silver9', 0.95, 44, 80, 1.2, 2.3, { ironIngot: 14, goldIngot: 3, crystal: 3 }, 3200, 9, $t('上单翼、四台发动机、深深的机腹：第三代飞机能做到的最好。')),
  ] },
  freighter: { kind: 'boat', gen: 3, flames: false, rest: 1, base: { speed: 48, agility: 0.9, ...BOAT }, levels: [
    L(7, $t('明轮汽船'), 'paddle', 1.0, 80, 48, 0.9, 2, { plank: 24, ironIngot: 14, copperIngot: 8, coal: 20 }, 1500, 7, $t('烟囱、两侧的大明轮：不看风也能走。第三代的开始。')),
    L(8, $t('远洋货船'), 'steelship', 1.0, 100, 50, 0.9, 2.2, { ironIngot: 20, copperIngot: 6, goldIngot: 1 }, 2100, 8, $t('钢壳、货舱口和吊杆：去哪都不怕浪。')),
    L(9, $t('蒸汽货轮'), 'liner', 1.0, 120, 54, 0.9, 2.4, { ironIngot: 24, goldIngot: 2, crystal: 2 }, 3000, 9, $t('两根烟囱、高高的驾驶楼：第三代船能做到的最好。')),
  ] },
  flagship: { kind: 'boat', gen: 4, flames: false, rest: 1, base: { speed: 56, agility: 1.0, ...BOAT }, levels: [
    L(10, $t('旗舰'), 'flagship', 1.0, 160, 56, 1.0, 3, { plank: 40, ironIngot: 30, goldIngot: 5, crystal: 6, cloth: 20 }, 4800, 10, $t('钢壳上三根桅、三张大帆：帆面是你的画布。')),
  ] },
  airship: { kind: 'plane', gen: 4, flames: false, rest: 4, base: { speed: 60, agility: 0.8, ...PLANE }, levels: [
    L(10, $t('飞艇'), 'airship', 0.8, 80, 60, 0.8, 3, { cloth: 40, rope: 20, ironIngot: 20, goldIngot: 5, crystal: 6 }, 5000, 10, $t('运输艇：货舱最大，吊舱下还能挂一架小飞机一起走。慢，但什么都装得下。')),
  ] },
}
/** how worn a vehicle is: each 1 when new, 0 when it is all but gone (it never quite stops) */
export interface Wear { engine: number; hull: number; paint: number }
export const NEW_WEAR: Wear = { engine: 1, hull: 1, paint: 1 }
/** a hull at a level, as it flies: worn engines are slower, a battered hull carries less */
export function vehicleDef(type: VehicleId, lv?: number, wear?: Wear): VehicleDef {
  const h = HULLS[type]
  const L = h.levels.find((x) => x.lv === lv) ?? h.levels[0]
  const top = Math.max(...h.levels.filter((x) => !x.planned).map((x) => x.lv), h.levels[0].lv)
  const w = wear ?? NEW_WEAR
  const engine = w.engine >= 0.6 ? 1 : 0.72 + 0.28 * (w.engine / 0.6)
  const hull = w.hull >= 0.6 ? 1 : 0.55 + 0.45 * (w.hull / 0.6)
  return {
    name: L.name, kind: h.kind, model: L.model, scale: L.scale, flames: h.flames, desc: L.desc, cost: L.cost,
    cargo: Math.max(2, Math.floor(L.cargo * hull)), rest: h.rest,
    flight: { ...h.base, speed: L.speed * engine, agility: L.agility },
    lv: L.lv, top, armor: L.armor, island: L.island, planned: L.planned,
  }
}
/** the ones that can be built from nothing: each generation's first level */
export const VEHICLES: Record<VehicleId, VehicleDef> = Object.fromEntries((Object.keys(HULLS) as VehicleId[]).map((id) => [id, vehicleDef(id)])) as Record<VehicleId, VehicleDef>
export const VEHICLE_ORDER: VehicleId[] = ['sparrow', 'skiff', 'biplane', 'sloop', 'falcon', 'freighter', 'airship', 'flagship']
/** the next level up in the same hull (null at the generation's end) */
export function nextLevel(type: VehicleId, lv: number): HullLevel | null {
  return HULLS[type].levels.find((x) => x.lv === lv + 1) ?? null
}

/** what can be bolted on to a vehicle (each once per vehicle): see docs/DESIGN.md, 海盗 */
export type UpgradeId = 'engine' | 'armor' | 'lock' | 'guns'
export const UPGRADES: Record<UpgradeId, { name: string; desc: string; cost: Bag; coins: number }> = {
  engine: { name: $t('增压引擎'), desc: $t('巡航和加速都快 12%，更容易甩掉海盗。'), cost: { copperIngot: 3, ironIngot: 1 }, coins: 150 },
  armor: { name: $t('护板'), desc: $t('被咬住后，海盗要多花一半时间才能得手。'), cost: { ironIngot: 3 }, coins: 200 },
  lock: { name: $t('货舱锁'), desc: $t('被抢时损失减半。'), cost: { ironIngot: 2, rope: 2 }, coins: 180 },
  guns: { name: $t('武器挂架'), desc: $t('一门机炮和 4 枚导弹（岛 5 级，只有飞机能装）。被空盗追可以还手，也能出击清剿空盗。'), cost: { ironIngot: 4, copperIngot: 2 }, coins: 300 },
}

// ───────────────────────────────────────────────────────────── fishing
export interface FishDef {
  item: ItemId
  /** how it fights on the line: pull 0..1 (how hard), dart: how often it surges, size: its shadow */
  pull: number
  dart: number
  size: 1 | 2 | 3
  /** only by night, or only in some islands' waters ('any' otherwise) */
  where: 'any' | 'reef' | 'home' | 'pine' | 'peak'
  weight: number
}
/** what bites a rod, by how common it is. Waters differ: see ISLAND waters in world.ts */
export const ROD_FISH: FishDef[] = [
  { item: 'sardine', pull: 0.25, dart: 0.2, size: 1, where: 'any', weight: 46 },
  { item: 'bream', pull: 0.4, dart: 0.35, size: 2, where: 'any', weight: 30 },
  { item: 'mackerel', pull: 0.55, dart: 0.7, size: 2, where: 'any', weight: 15 },
  { item: 'tuna', pull: 0.8, dart: 0.55, size: 3, where: 'any', weight: 5 },
  { item: 'moonfish', pull: 0.9, dart: 0.9, size: 3, where: 'any', weight: 1 },
]
/** from a boat at sea: the open water's own fish. far: how much more (or less) of it there is a long way from any island */
export const SEA_FISH: (FishDef & { far: number })[] = [
  { item: 'flyingFish', pull: 0.3, dart: 0.8, size: 1, where: 'any', weight: 30, far: 0.7 },
  { item: 'mackerel', pull: 0.55, dart: 0.7, size: 2, where: 'any', weight: 24, far: 0.6 },
  { item: 'bonito', pull: 0.65, dart: 0.75, size: 2, where: 'any', weight: 22, far: 1.6 },
  { item: 'tuna', pull: 0.8, dart: 0.55, size: 3, where: 'any', weight: 14, far: 2.8 },
  { item: 'moonfish', pull: 0.9, dart: 0.9, size: 3, where: 'any', weight: 2, far: 1.5 },
  { item: 'swordfish', pull: 0.95, dart: 0.8, size: 3, where: 'any', weight: 3, far: 4 },
]
export interface DiveFishDef {
  item: ItemId
  model: string
  /** shots to bring it in, how fast it swims and bolts, how near the diver can get before it notices */
  hp: number
  speed: number
  flee: number
  wary: number
  /** how deep it lives: 0 shallow … 1 the trench */
  depth: [number, number]
  weight: number
}
export const DIVE_FISH: DiveFishDef[] = [
  { item: 'reefFish', model: 'fishS', hp: 1, speed: 14, flee: 46, wary: 26, depth: [0, 0.6], weight: 50 },
  { item: 'bream', model: 'fishM', hp: 1, speed: 12, flee: 52, wary: 34, depth: [0.1, 0.8], weight: 22 },
  { item: 'grouper', model: 'fishL', hp: 2, speed: 9, flee: 44, wary: 30, depth: [0.35, 1], weight: 16 },
  { item: 'octopus', model: 'octo', hp: 2, speed: 8, flee: 70, wary: 38, depth: [0.6, 1], weight: 7 },
  { item: 'tuna', model: 'fishXL', hp: 3, speed: 22, flee: 78, wary: 50, depth: [0.7, 1], weight: 4 },
]
/** lying on the sea bed, to be picked up by hand */
export const DIVE_FLOOR: { item: ItemId; model: string; depth: [number, number]; weight: number }[] = [
  { item: 'urchin', model: 'urchin', depth: [0, 1], weight: 50 },
  { item: 'shell', model: 'shell', depth: [0, 0.6], weight: 30 },
  { item: 'lobster', model: 'lobster', depth: [0.5, 1], weight: 14 },
  { item: 'pearl', model: 'oyster', depth: [0.6, 1], weight: 6 },
]
export const DIVE = { oxygen: 45, oxygenTank: 80, bag: 8, swim: 34, range: 74, reload: 0.7 }

// ───────────────────────────────────────────────────────────── the mine
export type OreId = 'stone' | 'coal' | 'copper' | 'iron' | 'gold' | 'crystal' | 'moon'
export const ORES: Record<OreId, { item: ItemId; name: string; hp: number; tier: number; chips: string; mat: string; n: [number, number] }> = {
  stone: { item: 'stone', name: $t('岩石'), hp: 2, tier: 1, chips: 'rock', mat: 'caveRock', n: [1, 2] },
  coal: { item: 'coal', name: $t('煤'), hp: 3, tier: 1, chips: 'coal', mat: 'veinCoal', n: [1, 3] },
  copper: { item: 'copperOre', name: $t('铜矿'), hp: 4, tier: 1, chips: 'copper', mat: 'veinCopper', n: [1, 3] },
  iron: { item: 'ironOre', name: $t('铁矿'), hp: 6, tier: 2, chips: 'iron', mat: 'veinIron', n: [1, 3] },
  gold: { item: 'goldOre', name: $t('金矿'), hp: 8, tier: 3, chips: 'gold', mat: 'veinGold', n: [1, 2] },
  crystal: { item: 'crystal', name: $t('水晶'), hp: 8, tier: 3, chips: 'crystal', mat: 'veinCrystal', n: [1, 1] },
  moon: { item: 'moonstone', name: $t('月光石'), hp: 10, tier: 3, chips: 'crystal', mat: 'veinMoon', n: [1, 1] },
}
/**
 * What a block of rock holds, by depth: weights per level band. Shallow levels are stone, coal
 * and copper; the deeper the level, the better the odds of something rare — but it is odds.
 */
export const MINE_BANDS: { upTo: number; ore: Partial<Record<OreId, number>> }[] = [
  { upTo: 3, ore: { stone: 70, coal: 13, copper: 15, iron: 2 } },
  { upTo: 6, ore: { stone: 58, coal: 11, copper: 12, iron: 15, gold: 3, crystal: 1 } },
  { upTo: 99, ore: { stone: 52, coal: 9, copper: 8, iron: 16, gold: 9, crystal: 5, moon: 1 } },
]
/** a pick of this tier is needed to break through the hard rock that seals the way down from these levels */
export const MINE_GATES: Record<number, number> = { 3: 2, 6: 3 }

// ───────────────────────────────────────────────────────────── furniture
/**
 * Furniture. `place`: where it can go — on the floor (the default), flat on the floor so other
 * things stand on it (rug), on a wall at a height (wall), or on top of something with a surface
 * (top). `top`: how high a surface it has, if things can be set on it. `back`: it wants a wall
 * behind it (beds, shelves, sofas), so the auto-placing turns it to face the room.
 */
export interface FurnitureDef { model: string; solid: number; charm: number; indoor?: IndoorUse; place?: 'floor' | 'rug' | 'wall' | 'top'; top?: number; back?: boolean; wallZ?: number }
export const FURNITURE: Partial<Record<ItemId, FurnitureDef>> = {
  bench: { model: 'f_bench', solid: 3, charm: 2 },
  flowerBed: { model: 'f_flowerBed', solid: 3, charm: 2 },
  lampPost: { model: 'f_lamp', solid: 1, charm: 3 },
  flag: { model: 'f_flag', solid: 1, charm: 3 },
  table: { model: 'f_table', solid: 4, charm: 3 },
  chime: { model: 'f_chime', solid: 1, charm: 6 },
  fishRack: { model: 'f_rack', solid: 4, charm: 6 },
  trophy: { model: 'f_trophy', solid: 2, charm: 14 },
  crystalLamp: { model: 'f_crystal', solid: 1, charm: 18 },
  goldStatue: { model: 'f_statue', solid: 3, charm: 30 },
  fountain: { model: 'f_fountain', solid: 6, charm: 60 },
  keeperLamp: { model: 'f_keeper', solid: 1, charm: 40 },
  // indoors (solid is unused there: the footprint is the model's)
  bed: { model: 'i_bed', solid: 6, charm: 3, indoor: 'bed', back: true },
  wardrobe: { model: 'i_wardrobe', solid: 4, charm: 2, indoor: 'wardrobe', back: true },
  toilet: { model: 'i_toilet', solid: 2, charm: 1, indoor: 'toilet' },
  sink: { model: 'i_sink', solid: 2, charm: 1, indoor: 'sink' },
  shower: { model: 'i_shower', solid: 4, charm: 2, indoor: 'shower' },
  bathtub: { model: 'i_bathtub', solid: 5, charm: 5, indoor: 'bathtub' },
  stove: { model: 'i_stove', solid: 3, charm: 2, indoor: 'stove', back: true },
  fridge: { model: 'i_fridge', solid: 3, charm: 2, indoor: 'fridge', back: true },
  counter: { model: 'i_counter', solid: 3, charm: 1, indoor: 'counter', back: true, top: 8 },
  dinnerTable: { model: 'i_dinner', solid: 4, charm: 2, indoor: 'table', top: 9 },
  chair: { model: 'i_chair', solid: 2, charm: 1, indoor: 'seat' },
  sofa: { model: 'i_sofa', solid: 5, charm: 3, indoor: 'seat', back: true },
  tv: { model: 'i_tv', solid: 4, charm: 4, indoor: 'tv', back: true },
  coffeeTable: { model: 'i_coffee', solid: 3, charm: 1, indoor: 'table', top: 5 },
  rug: { model: 'i_rug', solid: 0, charm: 2, indoor: 'rug', place: 'rug' },
  bookshelf: { model: 'i_books', solid: 4, charm: 3, indoor: 'books', back: true },
  pottedPlant: { model: 'i_plant', solid: 2, charm: 2, indoor: 'deco' },
  floorLamp: { model: 'i_lamp', solid: 1, charm: 2, indoor: 'deco' },
  desk: { model: 'i_desk', solid: 4, charm: 2, indoor: 'desk', top: 8, back: true },
  fireplace: { model: 'i_fire', solid: 5, charm: 6, indoor: 'fire', back: true },
  stockMachine: { model: 'i_stocks', solid: 4, charm: 2, indoor: 'stocks' },
  computer: { model: 'i_computer', solid: 3, charm: 3, indoor: 'stocks', place: 'top' },
  roundTable: { model: 'i_roundTable', solid: 5, charm: 3, indoor: 'table', top: 8 },
  sideTable: { model: 'i_sideTable', solid: 3, charm: 1, indoor: 'table', top: 7 },
  nightstand: { model: 'i_nightstand', solid: 3, charm: 2, indoor: 'table', top: 7, back: true },
  longTable: { model: 'i_longTable', solid: 5, charm: 3, indoor: 'table', top: 8 },
  armchair: { model: 'i_armchair', solid: 4, charm: 3, indoor: 'seat', back: true },
  stool: { model: 'i_stool', solid: 2, charm: 1, indoor: 'seat' },
  rockingChair: { model: 'i_rocker', solid: 4, charm: 4, indoor: 'rock' },
  cushion: { model: 'i_cushion', solid: 2, charm: 1, indoor: 'low' },
  bigPillow: { model: 'i_pillow', solid: 3, charm: 2, indoor: 'low' },
  beanbag: { model: 'i_beanbag', solid: 4, charm: 3, indoor: 'low' },
  doubleBed: { model: 'i_bed2', solid: 8, charm: 5, indoor: 'bed', back: true },
  dresser: { model: 'i_dresser', solid: 5, charm: 3, indoor: 'lean', top: 10, back: true },
  cupboard: { model: 'i_cupboard', solid: 5, charm: 3, indoor: 'lean', back: true },
  wallShelf: { model: 'i_shelf', solid: 0, charm: 2, indoor: 'deco', place: 'wall', wallZ: 9 },
  tableLamp: { model: 'i_tableLamp', solid: 0, charm: 2, indoor: 'lamp', place: 'top' },
  wallLamp: { model: 'i_wallLamp', solid: 0, charm: 2, indoor: 'lamp', place: 'wall', wallZ: 10 },
  stringLights: { model: 'i_lights', solid: 0, charm: 3, indoor: 'lamp', place: 'wall', wallZ: 14 },
  candle: { model: 'i_candle', solid: 0, charm: 1, indoor: 'lamp', place: 'top' },
  roundRug: { model: 'i_roundRug', solid: 0, charm: 2, indoor: 'rug', place: 'rug' },
  runnerRug: { model: 'i_runner', solid: 0, charm: 2, indoor: 'rug', place: 'rug' },
  paintingSea: { model: 'i_paintSea', solid: 0, charm: 3, indoor: 'look', place: 'wall', wallZ: 8 },
  paintingFlower: { model: 'i_paintFlower', solid: 0, charm: 2, indoor: 'look', place: 'wall', wallZ: 8 },
  chartFrame: { model: 'i_chart', solid: 0, charm: 3, indoor: 'look', place: 'wall', wallZ: 8 },
  wallClock: { model: 'i_clock', solid: 0, charm: 2, indoor: 'clock', place: 'wall', wallZ: 11 },
  curtains: { model: 'i_curtains', solid: 0, charm: 2, indoor: 'curtain', place: 'wall', wallZ: 5 },
  mirror: { model: 'i_mirror', solid: 0, charm: 2, indoor: 'mirror', place: 'wall', wallZ: 6 },
  bigPlant: { model: 'i_bigPlant', solid: 3, charm: 3, indoor: 'deco' },
  cactus: { model: 'i_cactus', solid: 0, charm: 1, indoor: 'deco', place: 'top' },
  hangingPlant: { model: 'i_hanging', solid: 0, charm: 2, indoor: 'deco', place: 'wall', wallZ: 9 },
  flowerVase: { model: 'i_vase', solid: 0, charm: 2, indoor: 'deco', place: 'top' },
  bookStack: { model: 'i_bookStack', solid: 0, charm: 1, indoor: 'deco', place: 'top' },
  teaSet: { model: 'i_tea', solid: 0, charm: 2, indoor: 'tea', place: 'top' },
  fishbowl: { model: 'i_fishbowl', solid: 0, charm: 3, indoor: 'fish', place: 'top' },
  globe: { model: 'i_globe', solid: 0, charm: 2, indoor: 'deco', place: 'top' },
  aquarium: { model: 'i_aquarium', solid: 5, charm: 5, indoor: 'fish', back: true, top: 12 },
  fishPlaque: { model: 'i_plaque', solid: 0, charm: 3, indoor: 'fish', place: 'wall', wallZ: 8 },
  woodStove: { model: 'i_woodStove', solid: 4, charm: 4, indoor: 'fire', back: true },
  photoFrame: { model: 'i_photo', solid: 0, charm: 2, indoor: 'photo', place: 'wall', wallZ: 6 },
  guestbook: { model: 'i_guestbook', solid: 0, charm: 2, indoor: 'guestbook', place: 'top' },
  homeBench: { model: 'i_homeBench', solid: 5, charm: 3, indoor: 'craft', back: true, top: 9 },
  planter: { model: 'i_planter', solid: 4, charm: 3, indoor: 'planter', back: true },
  telescope: { model: 'i_telescope', solid: 3, charm: 6, indoor: 'stars' },
  pool: { model: 'i_pool', solid: 0, charm: 10, indoor: 'swim', place: 'rug' },
  deckChair: { model: 'i_deckChair', solid: 4, charm: 2, indoor: 'low' },
  beacon: { model: 'i_beacon', solid: 6, charm: 20, indoor: 'beacon' },
}
export type IndoorUse = 'craft' | 'planter' | 'stars' | 'swim' | 'beacon' | 'photo' | 'guestbook' | 'low' | 'rock' | 'lean' | 'lamp' | 'look' | 'clock' | 'curtain' | 'mirror' | 'tea' | 'fish' | 'stocks' | 'fire' | 'bed' | 'wardrobe' | 'toilet' | 'sink' | 'shower' | 'bathtub' | 'stove' | 'fridge' | 'counter' | 'table' | 'seat' | 'tv' | 'rug' | 'books' | 'deco' | 'desk'

// ── carrying: what is on the pilot is kept in slots
/** the hotbar: always there, and all there is until a backpack is made */
export const HOTBAR = 8
/** the backpacks, in order: each one made adds a row of slots */
export const PACKS: ItemId[] = ['pack1', 'pack2', 'pack3']
export const PACK_ROW = 8
/** how many of one thing a slot holds */
export function stackOf(item: ItemId): number {
  const k = ITEMS[item].kind
  if (item === 'smoke') return 5
  if (k === 'tool' || k === 'gear' || k === 'furniture') return 1
  if (k === 'fish' || k === 'critter') return 10
  return 30
}
/** how many slots a bag of things takes up */
export function slotsFor(bag: Bag): number {
  let n = 0
  for (const k in bag) {
    const c = bag[k as ItemId] ?? 0
    if (c > 0 && !PACKS.includes(k as ItemId)) n += Math.ceil(c / stackOf(k as ItemId)) // (a backpack is worn, not carried)
  }
  return n
}
/** a tool or a backpack being the better one of its line, the lesser ones of that line */
export function betterThan(item: ItemId): ItemId[] {
  for (const line of [...Object.values(TOOLS), PACKS]) {
    const i = line.indexOf(item)
    if (i >= 0) return line.slice(i + 1)
  }
  return []
}
export function supersedes(item: ItemId): ItemId[] {
  for (const line of [...Object.values(TOOLS), PACKS]) {
    const i = line.indexOf(item)
    if (i > 0) return line.slice(0, i)
  }
  return []
}

// ── bags
export function has(inv: Bag, cost: Bag, times = 1): boolean {
  for (const k in cost) if ((inv[k as ItemId] ?? 0) < (cost[k as ItemId] ?? 0) * times) return false
  return true
}
export function take(inv: Bag, cost: Bag, times = 1) {
  for (const k in cost) inv[k as ItemId] = (inv[k as ItemId] ?? 0) - (cost[k as ItemId] ?? 0) * times
}
export function give(inv: Bag, add: Bag, times = 1) {
  for (const k in add) inv[k as ItemId] = (inv[k as ItemId] ?? 0) + (add[k as ItemId] ?? 0) * times
}
export function bagText(bag: Bag): string {
  return (Object.keys(bag) as ItemId[]).map((k) => `${ITEMS[k].name}×${bag[k]}`).join($t('、'))
}
