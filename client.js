window.__ModuleLoader__.load({
  id: 'dsh-animebar',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useCallback } = React;

    const CACHE_KEY = 'animebar.plugin.cache';

    function readCache() {
      try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.day !== new Date().toDateString()) return null;
        return parsed.items;
      } catch (e) {
        return null;
      }
    }

    function writeCache(items) {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ day: new Date().toDateString(), items }));
      } catch (e) {
        /* 存储不可用就每次重新抓 */
      }
    }

    async function fetchToday() {
      const res = await fetch('https://api.bgm.tv/calendar', {
        headers: { 'user-agent': 'dsh-animebar/0.2' },
      });
      if (!res.ok) throw new Error('Bangumi ' + res.status);
      const data = await res.json();
      const wd = new Date().getDay() || 7;
      const day = data.find((d) => d.weekday && d.weekday.id === wd);
      const items = ((day && day.items) || []).map((it) => ({
        id: it.id,
        title: it.name_cn || it.name,
        score: (it.rating && it.rating.score) || 0,
        img: (it.images && (it.images.common || it.images.large)) || '',
        url: 'https://bgm.tv/subject/' + it.id,
      }));
      items.sort((a, b) => b.score - a.score);
      return items;
    }

    const styles = {
      btn: {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
        height: 28, padding: '0 11px', borderRadius: 999, cursor: 'pointer',
        border: '1px solid #22c55e', background: '#22c55e', color: '#04140a',
        fontSize: 12, fontWeight: 600, lineHeight: 1,
      },
      hint: {
        position: 'absolute', left: 0, bottom: 36, whiteSpace: 'nowrap',
        background: '#0f172a', color: '#e2e8f0', border: '1px solid #22c55e',
        borderRadius: 8, padding: '5px 9px', fontSize: 11,
        boxShadow: '0 8px 20px rgba(0,0,0,.35)',
      },
      panel: {
        position: 'fixed', right: 16, bottom: 88, width: 360, maxHeight: '70vh',
        display: 'flex', flexDirection: 'column', zIndex: 60,
        background: '#0f172a', color: '#e2e8f0', borderRadius: 14,
        border: '1px solid #1e293b', boxShadow: '0 18px 48px rgba(0,0,0,.45)',
        fontFamily: 'system-ui, -apple-system, "PingFang SC", sans-serif', overflow: 'hidden',
      },
      head: {
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', borderBottom: '1px solid #1e293b', fontSize: 13,
      },
      list: { overflowY: 'auto', padding: 6 },
      row: {
        display: 'flex', gap: 10, alignItems: 'center', padding: '6px 8px',
        borderRadius: 8, textDecoration: 'none', color: 'inherit',
      },
      cover: { width: 34, height: 48, borderRadius: 5, objectFit: 'cover', background: '#1e293b', flex: '0 0 auto' },
      title: { fontSize: 12.5, lineHeight: 1.35, margin: 0, flex: 1 },
      score: { fontSize: 11, fontVariantNumeric: 'tabular-nums', color: '#94a3b8', flex: '0 0 auto' },
      close: {
        marginLeft: 'auto', cursor: 'pointer', border: 'none', background: 'transparent',
        color: '#94a3b8', fontSize: 16, lineHeight: 1, padding: 2,
      },
      status: { padding: 14, fontSize: 12, color: '#94a3b8' },
    };

    function AnimeButton() {
      const [open, setOpen] = useState(false);
      const [hint, setHint] = useState(() => {
        try { return localStorage.getItem('animebar.hint') !== 'seen'; } catch (e) { return true; }
      });
      const [items, setItems] = useState(null);
      const [error, setError] = useState('');

      const load = useCallback(async (force) => {
        if (!force) {
          const cached = readCache();
          if (cached) {
            setItems(cached);
            return;
          }
        }
        setError('');
        setItems(null);
        try {
          const list = await fetchToday();
          setItems(list);
          writeCache(list);
        } catch (e) {
          setError('抓取失败，稍后再试');
        }
      }, []);

      useEffect(() => {
        if (open && items === null && !error) load(false);
      }, [open, items, error, load]);

      const dismissHint = () => {
        if (!hint) return;
        setHint(false);
        try { localStorage.setItem('animebar.hint', 'seen'); } catch (e) { /* 忽略 */ }
      };

      return h('div', { style: { display: 'inline-flex', position: 'relative' } },
        hint && !open ? h('div', { style: styles.hint }, '点这里看今天的番') : null,
        h('button', {
          type: 'button',
          title: '今天的番（Bangumi）',
          onClick: () => { setOpen((v) => !v); dismissHint(); },
          style: styles.btn,
        }, '番表'),
        open ? h('div', { style: styles.panel },
          h('div', { style: styles.head },
            h('span', null, '今天的番'),
            h('button', {
              type: 'button',
              style: { marginLeft: 'auto', cursor: 'pointer', border: 'none', background: 'transparent', color: '#93c5fd', fontSize: 11, padding: 0 },
              onClick: () => load(true),
            }, '刷新'),
            h('button', { type: 'button', onClick: () => setOpen(false), style: styles.close, title: '关闭' }, '×'),
          ),
          error
            ? h('div', { style: styles.status }, error)
            : items === null
              ? h('div', { style: styles.status }, '正在抓取…')
              : h('div', { style: styles.list },
                  items.length === 0
                    ? h('div', { style: styles.status }, '今天没有在播的作品')
                    : items.map((it) => h('a', {
                        key: it.id,
                        href: it.url,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                        style: styles.row,
                      },
                        h('img', { src: it.img, alt: '', style: styles.cover, loading: 'lazy' }),
                        h('p', { style: styles.title }, it.title),
                        h('span', { style: styles.score }, it.score ? it.score.toFixed(1) : '—'),
                      )),
                ),
        ) : null,
      );
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'animebar-button',
          order: 5,
        }, AnimeButton));
      },
    };
  },
});
