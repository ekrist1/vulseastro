import { describe, it, expect } from 'vitest'
import { WhereBuilder, CollectionQuery } from '../../src/server/sdk/query'

describe('WhereBuilder', () => {
  it('builds an AND group of conditions', () => {
    const b = new WhereBuilder()
    b.where('status', 'published').where('content.views', '>=', 100)
    expect(b.group).toEqual({
      combine: 'and',
      nodes: [
        { field: 'status', op: 'eq', value: 'published' },
        { field: 'content.views', op: 'gte', value: 100 },
      ],
    })
  })

  it('flips the group to OR when orWhere is used', () => {
    const b = new WhereBuilder()
    b.where('content.views', '>=', 100).orWhere('createdBy', '=', 'a1')
    expect(b.group.combine).toBe('or')
    expect(b.group.nodes).toHaveLength(2)
  })

  it('nests a group via andWhere', () => {
    const b = new WhereBuilder()
    b.andWhere((q) => q.where('content.views', '>=', 100).orWhere('createdBy', '=', 'a1'))
    expect(b.group).toEqual({
      combine: 'and',
      nodes: [
        { combine: 'or', nodes: [
          { field: 'content.views', op: 'gte', value: 100 },
          { field: 'createdBy', op: 'eq', value: 'a1' },
        ] },
      ],
    })
  })
})

describe('CollectionQuery spec construction', () => {
  const make = () => new CollectionQuery(null as never, null as never, 'post').locale('en')

  it('defaults status to published when no status condition is present', async () => {
    const spec = await make().where('content.views', '>=', 10).toSpec()
    expect(spec.collection).toBe('post')
    expect(spec.locale).toBe('en')
    expect(spec.where).toEqual({
      combine: 'and',
      nodes: [
        { combine: 'and', nodes: [{ field: 'content.views', op: 'gte', value: 10 }] },
        { field: 'status', op: 'eq', value: 'published' },
      ],
    })
  })

  it('does not inject a default status when one is supplied', async () => {
    const spec = await make().where('status', 'draft').toSpec()
    expect(spec.where).toEqual({ combine: 'and', nodes: [{ field: 'status', op: 'eq', value: 'draft' }] })
  })

  it('applies when() only on truthy condition', async () => {
    const withTag = await make().when('news', (q) => q.where('content.tag', '=', 'news')).toSpec()
    expect(JSON.stringify(withTag.where)).toContain('content.tag')
    const withoutTag = await make().when('', (q) => q.where('content.tag', '=', 'news')).toSpec()
    expect(JSON.stringify(withoutTag.where)).not.toContain('content.tag')
  })

  it('records descendants, orderBy, limit, offset', async () => {
    const spec = await make()
      .descendantsOf('p1', { depth: 2 })
      .orderBy('publishedAt', 'desc')
      .limit(20).offset(40)
      .toSpec()
    expect(spec.descendants).toEqual({ parentId: 'p1', depth: 2 })
    expect(spec.orderBy).toEqual([{ field: 'publishedAt', dir: 'desc' }])
    expect(spec.limit).toBe(20)
    expect(spec.offset).toBe(40)
  })
})
