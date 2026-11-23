// The parts of the game that are not on an island: the title screen, the settings, the journal
// (goals, friends, the collection book) and the ending.

import { Book, type Page } from './book'
import { FishBookPage } from './fishbook'
import { useState } from 'preact/hooks'
import type { Game } from '../game/game'
import { ITEMS, RARITY_NAME, bagText, type ItemId } from '../game/data'
import { QUESTS } from '../game/quests'
import { CHAPTERS, CODEX, FRIENDS, FRIEND_NAME, FRIEND_STEPS, codexItems } from '../game/story'
import { PET_ORDER, PET_SPECIES } from '../engine/petdefs'
import { ISLAND_PETS, PET_RULES, rarityOf } from '../game/pets'
import { Coin, Icon, Sheet } from './bits'
import { audio } from './sound'
import { SKILLS, SKILL_ICON, SKILL_KNACK, SKILL_NAME, SKILL_PERK, LEVEL_XP, MAX_LEVEL } from '../game/skills'
import { $t, LANG, LANGS, chooseLang } from '../i18n'

export function Title({ game, onStart, onReset }: { game: Game; onStart: () => void; onReset: () => void }) {
  const [sure, setSure] = useState(false)
  const s = game.save
  const old = s.welcomed
  const ch = s.story ? (s.story.ended ? $t('彼岸之后') : $t('第{0}章', CHAPTERS[s.story.ch]?.no ?? $t('五'))) : $t('第一章')
  return (
    <div class="title">
      <div class="title-card">
        <h1>{$t('云岭航行')}</h1>
        <p class="title-sub">{$t('海的那一边是什么？')}</p>
        {old && <p class="title-save">{$t('{0} · {1} · {2} 级 · ', s.name || $t('你的小岛'), ch, game.level)}<Coin />{s.coins}</p>}
        <div class="title-actions">
          <button class="btn big-btn" onClick={onStart}>{old ? $t('继续') : $t('开始')}</button>
          {old && !sure && <button class="btn ghost" onClick={() => setSure(true)}>{$t('新游戏')}</button>}
          {old && sure && <button class="btn danger" onClick={onReset}>{$t('确定：丢掉这座岛，重新开始')}</button>}
          {old && sure && <button class="btn ghost" onClick={() => setSure(false)}>{$t('算了')}</button>}
        </div>
        <p class="title-foot">{game.onlineStatus()}</p>
        <LangSwitch />
      </div>
    </div>
  )
}

/** 中文 | English: the choice is kept and the page reloads in it (the island is saved first) */
function LangSwitch() {
  return (
    <span class="row lang-switch">
      {LANGS.map((l) => (
        <button key={l.id} class={'btn small' + (l.id === LANG ? '' : ' ghost')} lang={l.id} onClick={() => chooseLang(l.id)}>{l.name}</button>
      ))}
    </span>
  )
}

export function Settings({ game, onReset, onTitle }: { game: Game; onReset: () => void; onTitle: () => void }) {
  const [, bump] = useState(0)
  const [sure, setSure] = useState(false)
  const [dev, setDev] = useState(false)
  const [name, setName] = useState(game.save.name ?? '')
  const set = game.save.settings ?? { music: 0.5, sfx: 0.55 }
  const vol = (k: 'music' | 'sfx', v: number) => {
    game.setVolume(k === 'music' ? v : set.music, k === 'sfx' ? v : set.sfx)
    audio.setVolume(game.save.settings!.music, game.save.settings!.sfx)
    if (k === 'sfx') audio.play('tap')
    bump((n) => n + 1)
  }
  return (
    <Sheet title={$t('菜单')} onClose={() => game.close()}>
      <div class="form">
        <label>{$t('音乐')}<input type="range" min="0" max="100" value={Math.round(set.music * 100)} onInput={(e) => vol('music', +(e.target as HTMLInputElement).value / 100)} /></label>
        <label>{$t('音效')}<input type="range" min="0" max="100" value={Math.round(set.sfx * 100)} onInput={(e) => vol('sfx', +(e.target as HTMLInputElement).value / 100)} /></label>
        <label>{$t('全部静音')}<button class={'btn small' + (audio.muted ? '' : ' ghost')} onClick={() => { audio.toggleMute(); audio.unlock(); bump((n) => n + 1) }}>{audio.muted ? $t('已静音') : $t('有声音')}</button></label>
        <label>语言 · Language<LangSwitch /></label>
        <label>{$t('视角')}
          <span class="row">
            <button class="btn small" onClick={() => { game.toggleView(); bump((n) => n + 1) }}>{game.view3d ? $t('换成俯视') : $t('换成斜视')}</button>
            <button class="btn small" disabled={!game.view3d} title={$t('向左转（Q）')} onClick={() => game.rotateView(-1)}>{$t('↶ 左转')}</button>
            <button class="btn small" disabled={!game.view3d} title={$t('向右转（E）')} onClick={() => game.rotateView(1)}>{$t('右转 ↷')}</button>
            <button class="btn small" onClick={() => { game.toggleZoom(); bump((n) => n + 1) }}>{game.islandZoom === 2 ? $t('镜头拉近') : $t('镜头拉远')}</button>
          </span>
        </label>
        <label>{$t('岛的名字')}
          <input type="text" maxLength={10} placeholder={$t('你的小岛')} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} onBlur={() => game.setName(name)} />
        </label>
      </div>
      <p class="dim small">{game.onlineStatus()}</p>
      <p class="dim small">{$t('操作：点地面走路，点东西使用。视角：空格换俯视 / 斜视，Q / E 转镜头，滚轮拉远近；手机上两指捏合拉远近、两指拧转镜头。飞行时 A / D 或拖动转向，Shift / J 加速。')}</p>
      <div class="actions wrap">
        <button class="btn ghost" onClick={() => { game.close(); onTitle() }}>{$t('回到标题画面')}</button>
        {!sure && <button class="btn ghost" onClick={() => setSure(true)}>{$t('重新开始…')}</button>}
        {sure && <button class="btn danger" onClick={onReset}>{$t('确定：清除存档')}</button>}
        <button class="btn ghost small" onClick={() => setDev(!dev)}>{$t('开发者')}</button>
      </div>
      {dev && (
        <div class="actions wrap">
          <button class="btn small" onClick={() => game.devGive()}>{$t('补给材料和金币')}</button>
          <button class="btn small ghost" onClick={() => game.setClock(0.3)}>{$t('白天')}</button>
          <button class="btn small ghost" onClick={() => game.setClock(0.72)}>{$t('黄昏')}</button>
          <button class="btn small ghost" onClick={() => game.setClock(0.8)}>{$t('夜晚')}</button>
          {(['clear', 'rain', 'storm', 'snow', 'fog'] as const).map((k) => <button key={k} class="btn small ghost" onClick={() => game.weather.force(k, k === 'clear' ? 0 : 240)}>{({ clear: $t('晴'), rain: $t('雨'), storm: $t('暴风雨'), snow: $t('雪'), fog: $t('雾') })[k]}</button>)}
        </div>
      )}
    </Sheet>
  )
}

export function Journal({ game }: { game: Game }) {
  const all = game.story.codexCount()
  const pages: Page[] = [
    { key: 'goals', mark: 'flag', title: $t('这一程'), body: () => <Goals game={game} /> },
    { key: 'skills', mark: 'hammer', title: $t('手艺'), body: () => <SkillBook game={game} /> },
    { key: 'friends', mark: 'people', title: $t('岛与岛主'), body: () => <Friends game={game} /> },
    { key: 'codex', mark: 'leaf', title: $t('图鉴 {0}/{1}', all.have, all.all), body: () => <Codex game={game} /> },
    { key: 'pets', mark: 'paw', title: $t('动物'), body: () => <PetBook game={game} /> },
    { key: 'fish', mark: 'fish', title: $t('鱼'), body: () => <FishBookPage game={game} /> },
  ]
  return <Book label={$t('航海日志')} pages={pages} onClose={() => game.close()} />
}

/** how practised the player is at each kind of work, and what the next levels bring */
function SkillBook({ game }: { game: Game }) {
  const sk = game.skills
  return (
    <>
      <p class="hand-note">{$t('做得越多，越省力气。')}</p>
      {SKILLS.map((s) => {
        const l = sk.level(s)
        const top = l >= MAX_LEVEL
        return (
          <div class="skill" key={s}>
            <div class="skill-head">
              <Icon id={SKILL_ICON[s]} />
              <b>{SKILL_NAME[s]}</b>
              <span class="lv">{$t('{0} 级', l)}</span>
              <div class="gauge"><i style={{ width: `${Math.round(sk.progress(s) * 100)}%` }} /></div>
              <span class="dim small">{top ? $t('满级') : `${sk.xp(s)}/${LEVEL_XP[l + 1]}`}</span>
            </div>
            <div class="dim small">{SKILL_PERK[s]}</div>
            <div class="small">
              {SKILL_KNACK[s].map((k, i) => <span class={'knack' + (sk.has(s, i as 0 | 1) ? ' on' : '')} key={i}>{i ? $t('10 级') : $t('5 级')} · {k}</span>)}
            </div>
          </div>
        )
      })}
    </>
  )
}

function Goals({ game }: { game: Game }) {
  const v = game.story.view()
  const q = game.quest()
  const at = v.open ? (v.ended ? CHAPTERS.length : game.save.story!.ch) : -1
  return (
    <>
      <div class={'chapter' + (v.open ? ' done' : ' now')}>
        <h3>{$t('第一章 · 登岛 {0}', v.open ? '✓' : `${q.index + 1}/${QUESTS.length - 1}`)}</h3>
        {!v.open && <p><b>{q.title}</b>{q.progress && <em> {q.progress}</em>}<br /><span class="dim">{q.hint}</span></p>}
      </div>
      {CHAPTERS.map((ch, i) => (
        <div class={'chapter' + (i < at ? ' done' : i === at ? ' now' : ' later')} key={ch.no}>
          <h3>{$t('第{0}章 · {1} ', ch.no, i <= at ? ch.title : $t('？？？'))}{i < at && '✓'}</h3>
          {i === at && (
            <>
              <p class="dim">{ch.intro}</p>
              {v.goals.map((g) => (
                <div class={'goal' + (g.done ? ' done' : '')} key={g.text}>
                  <span class="check">{g.done ? '✓' : '○'}</span>
                  <span class="grow">{g.text}</span>
                  {!g.done && g.progress && <em>{g.progress}</em>}
                </div>
              ))}
              <p class="dim small">{$t('完成后：')}<Coin />{ch.coins} · {bagText(ch.gift)}</p>
            </>
          )}
        </div>
      ))}
      {v.ended && <p class="dim">{$t('海图上的每座岛你都到过了。订单照旧，图鉴未满。')}</p>}
    </>
  )
}

function Friends({ game }: { game: Game }) {
  const ids = [...FRIENDS, ...(game.known('far') ? ['far'] : []), ...game.guests.map((g) => g.id)].filter((id) => game.layouts[id])
  return (
    <>
      {ids.map((id) => {
        const d = game.layouts[id].def
        const f = game.story.friend(id)
        const isFriend = (FRIENDS as readonly string[]).includes(id)
        return (
          <div class="card" key={id}>
            <div class="card-head">
              <b>{d.name}</b>
              <span class="dim">{d.guest ? $t('玩家的岛') : d.owner} · {(game.distanceTo(id) / 100).toFixed(1)} km{game.save.visited?.[id] ? '' : $t(' · 还没去过')}</span>
              {d.danger > 0 && <span class="skulls">{'☠'.repeat(d.danger)}</span>}
            </div>
            {isFriend && (
              <p>
                <span class="hearts">{FRIEND_STEPS.map((_, i) => (i < f.level ? '♥' : '♡')).join('')}</span> {FRIEND_NAME[f.level]}
                <span class="dim">{$t(' · 已送到 {0} 单{1}', f.points, f.next ? $t('，再送 {0} 单成为{1}', f.next - f.points, FRIEND_NAME[f.level + 1]) : '')}</span>
              </p>
            )}
            {d.sells.length > 0 && <p class="dim small">{$t('出：{0}　缺：{1}', d.sells.map((i) => ITEMS[i].name).join($t('、')), d.wants.map((i) => ITEMS[i].name).join($t('、')))}</p>}
            {d.guest && <p class="dim small">{$t('{0} · 去看看对方的岛。', d.tier >= 3 ? $t('群峰之岛') : d.tier >= 2 ? $t('大岛') : $t('小岛'))}</p>}
          </div>
        )
      })}
      {!game.known('far') && <p class="dim">{$t('海图的西边还空着一块。')}</p>}
      {game.guests.length === 0 && <p class="dim small">{game.onlineStatus()}</p>}
    </>
  )
}

function Codex({ game }: { game: Game }) {
  const seen = game.save.seen ?? {}
  const [tip, setTip] = useState<ItemId | null>(null)
  return (
    <>
      {tip && (
        <div class="tip inline">
          <Icon id={tip} />
          <div><b>{ITEMS[tip].name}</b> <span class={'rarity r' + ITEMS[tip].rarity}>{RARITY_NAME[ITEMS[tip].rarity]}</span><div>{ITEMS[tip].desc}</div></div>
        </div>
      )}
      {CODEX.map((page) => {
        const items = codexItems(page.kind)
        const have = items.filter((i) => seen[i]).length
        return (
          <div key={page.kind}>
            <h3>{page.name} {have}/{items.length} <span class="dim small">{have === items.length ? $t('✓ 集齐') : <>{$t('集齐奖 ')}<Coin />{page.coins}</>}</span></h3>
            <div class="codex">
              {items.map((i) => (seen[i]
                ? <button class={'slot' + (ITEMS[i].rarity >= 2 ? ' rare' : '')} key={i} title={ITEMS[i].name} onClick={() => setTip(i)}><Icon id={i} /></button>
                : <span class="slot unknown" key={i}>?</span>))}
            </div>
          </div>
        )
      })}
    </>
  )
}

/** every species and every colour: seen in the wild, or owned — and where to look */
function PetBook({ game }: { game: Game }) {
  const seen = game.save.petSeen ?? {}
  const where = (sp: string) => Object.keys(ISLAND_PETS).filter((id) => ISLAND_PETS[id].some((x) => x.sp === sp)).map((id) => game.islandName(id)).join($t('、'))
  return (
    <>
      <p class="dim small">{$t('喂它爱吃的，几次就跟你回家。实心：养过；空心：见过。')}</p>
      {PET_ORDER.map((sp) => (
        <div class="card" key={sp}>
          <div class="card-head"><b>{PET_SPECIES[sp].name}</b><span class="dim small">{$t('爱吃{0} · 在{1}', ITEMS[PET_RULES[sp].food].name, where(sp))}</span></div>
          <div class="swatches">
            {PET_SPECIES[sp].colours.map((c) => {
              const n = seen[sp + ':' + c.id] ?? 0
              return (
                <span class={'swatch-cell' + (n ? '' : ' unknown')} key={c.id} title={n ? c.name : $t('？')}>
                  <span class={'swatch' + (n === 2 ? '' : ' hollow')} style={n ? { background: n === 2 ? `rgb(${c.main.join(',')})` : 'transparent', borderColor: `rgb(${c.dark.join(',')})` } : undefined} />
                  <small>{n ? c.name : '?'}{n && rarityOf(c) ? ' ★'.repeat(rarityOf(c)) : ''}</small>
                </span>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}

export function Ending({ game }: { game: Game }) {
  const s = game.save
  const mins = Math.round((s.played ?? 0) / 60)
  return (
    <Sheet title={$t('彼岸')}>
      <p>{$t('灯塔下站着守灯人。他说，这盏灯一直亮着，是为了让海那一边的人知道：这里有人。')}</p>
      <p>{$t('你回头看。来时的海上，很远很远的地方，也有一点光——那是你家门口的路灯。')}</p>
      <p class="dim">{$t('他把自己的提灯给了你。带回去，摆在岛上。')}</p>
      <div class="stats">
        <span>{$t('送到 ')}<b>{s.stats.delivered}</b>{$t(' 单')}</span>
        <span>{$t('捕到 ')}<b>{s.stats.fished ?? 0}</b>{$t(' 条鱼')}</span>
        <span>{$t('矿洞最深 ')}<b>{s.mine?.unlocked ?? 1}</b>{$t(' 层')}</span>
        <span>{$t('魅力 ')}<b>{game.charm}</b></span>
        <span>{$t('图鉴 ')}<b>{game.story.codexCount().have}/{game.story.codexCount().all}</b></span>
        {mins > 0 && <span>{$t('航行 ')}<b>{mins}</b>{$t(' 分钟')}</span>}
      </div>
      <p class="dim small">{$t('故事到这里讲完了，日子没有。岛还是你的岛：订单照旧，彼岸的店里有月光石，图鉴还没填满，朋友的岛就在海图上。')}</p>
      <p class="credits">{$t('云岭航行 · 画面与飞行手感来自 fighter 像素飞行原型 · 音乐与音效为程序化合成')}</p>
      <div class="actions"><button class="btn" onClick={() => game.close()}>{$t('回到岛上')}</button></div>
    </Sheet>
  )
}
