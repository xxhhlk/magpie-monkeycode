// 百智云签到 interaction 的语义锁。
// 关键约束：时序字段一动就被上游要求图片验证码，只能随机化坐标。
import test from "node:test"
import assert from "node:assert/strict"

import { varyBehavior, buildInteraction } from "../src/baizhi/interaction.mjs"
import { INTERACTION_TEMPLATE } from "../src/baizhi/interaction-template.mjs"

function fresh() {
  return JSON.parse(JSON.stringify(INTERACTION_TEMPLATE))
}

test("varyBehavior 只动坐标与 hold，dt / duration / 事件结构全部保持", () => {
  const original = fresh()
  const snap = fresh()
  varyBehavior(snap)

  assert.equal(snap.behavior.duration_ms, original.behavior.duration_ms, "duration 是时序校验的一部分，不能动")
  assert.equal(snap.behavior.events.length, original.behavior.events.length, "事件数不能变")
  snap.behavior.events.forEach((e, i) => {
    assert.equal(e.type, original.behavior.events[i].type, "事件类型序列不变")
    assert.equal(e.dt, original.behavior.events[i].dt, "每个事件的 dt 必须逐字保留")
  })
})

test("varyBehavior 每次产生不同的坐标，但点击仍落在按钮内", () => {
  const rect = INTERACTION_TEMPLATE.behavior.button_rect
  const a = fresh()
  const b = fresh()
  varyBehavior(a)
  varyBehavior(b)

  assert.notDeepEqual(a.behavior.events, b.behavior.events, "坐标应当随机化")
  for (const snap of [a, b]) {
    const click = snap.behavior.events[snap.behavior.events.length - 1]
    assert.equal(click.type, "click")
    assert.ok(click.x >= rect.x && click.x <= rect.x + rect.width, "click.x 在按钮内")
    assert.ok(click.y >= rect.y && click.y <= rect.y + rect.height, "click.y 在按钮内")
    const up = snap.behavior.events.find((e) => e.type === "pointerup")
    assert.ok(up.hold_ms >= 30 && up.hold_ms <= 110, "hold_ms 在合理范围")
  }
})

test("varyBehavior 坐标始终落在 viewport 内", () => {
  const { width, height } = INTERACTION_TEMPLATE.behavior.viewport
  for (let i = 0; i < 100; i++) {
    const snap = fresh()
    varyBehavior(snap)
    for (const e of snap.behavior.events) {
      assert.ok(e.x >= 2 && e.x <= width - 2, `x out of viewport: ${e.x}`)
      assert.ok(e.y >= 2 && e.y <= height - 2, `y out of viewport: ${e.y}`)
    }
  }
})

test("buildInteraction 每次产出不同的密文（IV 随机 + 坐标随机）", async () => {
  const a = await buildInteraction()
  const b = await buildInteraction()
  assert.equal(a.version, 1)
  assert.match(a.iv, /^[A-Za-z0-9+/]+={0,2}$/)
  assert.match(a.data, /^[A-Za-z0-9+/]+={0,2}$/)
  assert.notEqual(a.data, b.data, "两次 ciphertext 不该相同")
  assert.notEqual(a.iv, b.iv, "IV 每次都新")
})
