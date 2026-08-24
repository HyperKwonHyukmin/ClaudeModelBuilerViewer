import { describe, it, expect } from 'vitest'
import { formatNodeIds, groupNodeLabel, describeFailedGroups } from './hoistGroupNodeLabel.js'

describe('formatNodeIds', () => {
  it('노드 번호를 쉼표로 잇는다', () => {
    expect(formatNodeIds([10234, 10251, 10277])).toBe('10234, 10251, 10277')
  })

  it('많으면 앞쪽만 보이고 나머지는 개수로 접는다', () => {
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(formatNodeIds(ids)).toBe('1, 2, 3, 4, 5, 6, 7, 8 외 2개')
  })

  it('비었거나 배열이 아니면 빈 문자열', () => {
    expect(formatNodeIds([])).toBe('')
    expect(formatNodeIds(null)).toBe('')
    expect(formatNodeIds(undefined)).toBe('')
  })

  it('null 노드는 걸러낸다', () => {
    expect(formatNodeIds([101, null, 102])).toBe('101, 102')
  })
})

describe('groupNodeLabel', () => {
  const groups = { 1: [101, 102], 2: [201, 202, 203] }

  it('그룹과 노드 번호를 함께 보여준다 — 사용자가 고쳐야 할 대상이 노드이므로', () => {
    expect(groupNodeLabel(2, groups)).toBe('Group 2 (Node 201, 202, 203)')
  })

  it('노드를 모르면 그룹만 보여준다(문구가 깨지지 않게)', () => {
    expect(groupNodeLabel(3, groups)).toBe('Group 3')
    expect(groupNodeLabel(1, null)).toBe('Group 1')
  })

  it('groupId 가 없으면 빈 문자열', () => {
    expect(groupNodeLabel(null, groups)).toBe('')
    expect(groupNodeLabel(undefined, groups)).toBe('')
  })

  it('groupId 가 문자열 키여도 매칭된다(JSON 파싱 결과 방어)', () => {
    expect(groupNodeLabel('2', groups)).toBe('Group 2 (Node 201, 202, 203)')
  })
})

describe('describeFailedGroups', () => {
  const groups = { 1: [101, 102, 103, 104], 2: [201, 202, 203, 204] }

  it('실패한 그룹의 노드 번호와 사유를 함께 알려준다', () => {
    const results = [
      { groupId: 1, valid: true },
      { groupId: 2, valid: false, reason: 'Z 단차 6868mm 초과' },
    ]
    expect(describeFailedGroups(results, groups))
      .toBe('Group 2 (Node 201, 202, 203, 204): Z 단차 6868mm 초과')
  })

  it('실패 그룹이 여러 개면 전부 보여준다(한 번에 고치도록)', () => {
    const results = [
      { groupId: 1, valid: false, reason: '평면도 초과' },
      { groupId: 2, valid: false, reason: 'convex 아님' },
    ]
    expect(describeFailedGroups(results, groups))
      .toBe('Group 1 (Node 101, 102, 103, 104): 평면도 초과 / Group 2 (Node 201, 202, 203, 204): convex 아님')
  })

  it('사유가 없어도 그룹·노드는 알려준다', () => {
    const results = [{ groupId: 1, valid: false }]
    expect(describeFailedGroups(results, groups)).toBe('Group 1 (Node 101, 102, 103, 104)')
  })

  it('실패가 없으면 빈 문자열 — 호출측이 기존 문구로 넘어가게', () => {
    expect(describeFailedGroups([{ groupId: 1, valid: true }], groups)).toBe('')
    expect(describeFailedGroups([], groups)).toBe('')
    expect(describeFailedGroups(null, groups)).toBe('')
  })
})
