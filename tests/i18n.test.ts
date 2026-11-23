// Languages (round 23): the $t helper, and the English table kept honest.
import { describe, it, expect, afterEach } from 'vitest'
import { $t, useLang, LANG } from '../src/i18n'
import EN from '../src/i18n/en'

const slots = (s: string) => [...new Set([...s.matchAll(/\{(\d+)(?:\|[^}]*)?\}/g)].map((m) => m[1]))].sort().join(',')

describe('languages', () => {
  afterEach(() => useLang('zh'))

  it('the tests run in Chinese, the source language', () => {
    expect(LANG).toBe('zh')
    expect($t('还差 {0} 金币', 12)).toBe('还差 12 金币')
  })

  it('English: arguments anywhere, plural words, and the Chinese when a line has no English yet', () => {
    useLang('en')
    EN['测试：{0} 块木板'] = '{0} {0|plank|planks}'
    EN['测试：{0} 给 {1}'] = 'to {1} from {0}'
    expect($t('测试：{0} 块木板', 1)).toBe('1 plank')
    expect($t('测试：{0} 块木板', 3)).toBe('3 planks')
    expect($t('测试：{0} 给 {1}', 'A', 'B')).toBe('to B from A')
    expect($t('没有翻译的一句')).toBe('没有翻译的一句')
    delete EN['测试：{0} 块木板']
    delete EN['测试：{0} 给 {1}']
  })

  it('every English line keeps the same {0} {1}… as its Chinese', () => {
    const bad = Object.entries(EN).filter(([zh, en]) => en && slots(zh) !== slots(en)).map(([zh, en]) => `${zh} → ${en}`)
    expect(bad).toEqual([])
  })
})
