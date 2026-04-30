import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Search, X, Trash2, AlertTriangle, MapPin, Wine,
  Calendar, ChevronLeft, ChevronRight, ChevronDown, ArrowUpDown,
  MoreHorizontal, Download, Upload,
} from 'lucide-react';

const STORAGE_KEY = 'whiskey-collection-v1';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_OF_WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// One-time migration: convert legacy "X년" suffix in names to "X yo" and fold
// legacy structured age/vintage fields into the name string. Idempotent.
function migrateBottle(b) {
  if (!b) return b;
  let name = (b.name || '').trim();
  name = name.replace(/(\d+)\s*년/g, '$1 yo');

  if (b.age) {
    const ageEn = `${b.age} yo`;
    const ageKr = `${b.age}년`;
    if (!name.includes(ageEn) && !name.includes(ageKr)) {
      name = `${name} ${ageEn}`.trim();
    }
  }
  if (b.vintage) {
    const v = String(b.vintage).trim();
    if (v && !name.includes(v)) {
      name = `${name} ${v}`.trim();
    }
  }
  return {
    ...b,
    name,
    memo: b.memo || '',
    location: b.location || '',
    openedAt: b.openedAt || '',
    finishedAt: b.finishedAt || '',
  };
}

function normalize(s) {
  return (s || '').toLowerCase().replace(/\s+/g, '').replace(/[.,_\-'"`/\\()]/g, '');
}

function findSimilar(bottles, name, excludeId) {
  const nName = normalize(name);
  if (nName.length < 2) return [];
  return bottles
    .filter(b => b.id !== excludeId)
    .filter(b => {
      const bName = normalize(b.name);
      if (nName === bName) return true;
      if (nName.length >= 4) {
        if (bName.includes(nName)) return true;
        if (bName.length >= 4 && nName.includes(bName)) return true;
      }
      return false;
    })
    .slice(0, 6);
}

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function pluralize(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`;
}

function parseDate(isoStr) {
  const [y, m, d] = isoStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatISODate(year, month, day) {
  const m = (month + 1).toString().padStart(2, '0');
  const d = day.toString().padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    return parseDate(isoStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return isoStr;
  }
}

export default function App() {
  const [bottles, setBottles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [sortBy, setSortBy] = useState('addedAt');
  const [showAdd, setShowAdd] = useState(false);
  const [editingBottle, setEditingBottle] = useState(null);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const loaded = JSON.parse(stored);
        setBottles(loaded.map(migrateBottle));
      }
    } catch (e) {
      console.error('Load failed:', e);
    }
    setLoading(false);
  }, []);

  function persist(newBottles) {
    setBottles(newBottles);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newBottles));
    } catch (e) {
      console.error('Save failed:', e);
    }
  }

  const knownLocations = useMemo(() =>
    Array.from(new Set(bottles.map(b => b.location).filter(Boolean))).sort(),
    [bottles]
  );

  const counts = useMemo(() => {
    let sealed = 0, opened = 0, finished = 0;
    for (const b of bottles) {
      if (b.finishedAt) finished++;
      else if (b.openedAt) opened++;
      else sealed++;
    }
    return { sealed, opened, finished, active: sealed + opened, total: bottles.length };
  }, [bottles]);

  const searchTerms = useMemo(() =>
    searchQuery.trim().split(/\s+/).filter(Boolean).slice(0, 3),
    [searchQuery]
  );

  const filteredBottles = useMemo(() => {
    let result = bottles;
    if (searchTerms.length > 0) {
      result = result.filter(b => {
        const haystack = normalize(`${b.name || ''} ${b.location || ''} ${b.memo || ''}`);
        return searchTerms.every(term => haystack.includes(normalize(term)));
      });
    }
    if (filterLocation) result = result.filter(b => b.location === filterLocation);
    result = [...result].sort((a, b) => {
      if (sortBy === 'name')    return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'addedAt') return (b.addedAt || '').localeCompare(a.addedAt || '');
      return 0;
    });
    return result;
  }, [bottles, searchTerms, filterLocation, sortBy]);

  function addBottle(data)        { persist([{ id: uid(), ...data, addedAt: new Date().toISOString() }, ...bottles]); }
  function updateBottle(id, data) { persist(bottles.map(b => b.id === id ? { ...b, ...data } : b)); }
  function deleteBottle(id)       { persist(bottles.filter(b => b.id !== id)); }

  function handleImport(importedBottles) {
    const currentById = new Map(bottles.map(b => [b.id, b]));
    let added = 0, updated = 0;

    for (const imported of importedBottles) {
      const migrated = migrateBottle(imported);
      if (!migrated.id) migrated.id = uid();
      if (!migrated.addedAt) migrated.addedAt = new Date().toISOString();

      if (currentById.has(migrated.id)) {
        updated++;
      } else {
        added++;
      }
      currentById.set(migrated.id, migrated);
    }
    persist(Array.from(currentById.values()));
    return { added, updated };
  }

  return (
    <div className="min-h-screen">
      <header
        className="relative overflow-hidden pt-safe"
        style={{
          backgroundImage: 'url(/header-bg.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: '#1f0c05',
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, rgba(15,5,2,0.55) 0%, rgba(15,5,2,0.2) 35%, rgba(15,5,2,0.35) 65%, rgba(15,5,2,0.75) 100%)'
          }}
        />

        <button
          onClick={() => setShowMenu(true)}
          aria-label="Menu"
          className="absolute z-10 p-2 rounded-md transition-colors hover:bg-amber-950/50"
          style={{
            top: 'calc(env(safe-area-inset-top) + 0.5rem)',
            right: '0.75rem',
            color: 'rgba(254, 243, 199, 0.75)'
          }}
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>

        <div className="max-w-5xl mx-auto px-5 sm:px-6 py-12 relative">
          <h1
            className="font-display text-4xl md:text-5xl tracking-tight font-bold text-amber-50"
            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}
          >
            Inventory
          </h1>
          <div
            className="mt-3 text-sm num"
            style={{ color: 'rgba(254, 243, 199, 0.78)', textShadow: '0 1px 6px rgba(0,0,0,0.7)' }}
          >
            {counts.total === 0 ? (
              'No bottles yet'
            ) : (
              <>
                <span className="font-semibold text-amber-50">{counts.sealed}</span> bottles
                <span className="mx-1.5" style={{ color: 'rgba(254, 243, 199, 0.45)' }}>·</span>
                <span className="font-semibold text-amber-50">{counts.opened}</span> opened
                <span className="mx-1.5" style={{ color: 'rgba(254, 243, 199, 0.45)' }}>·</span>
                <span className="font-semibold text-amber-50">{counts.finished}</span> finished
              </>
            )}
          </div>
        </div>
      </header>

      <div
        className="sticky top-0 z-20 border-b border-stone-300/70"
        style={{ backdropFilter: 'blur(8px)' }}
      >
        <div
          aria-hidden
          style={{
            height: 'env(safe-area-inset-top)',
            backgroundImage: 'linear-gradient(to bottom, rgba(15,5,2,0.45), rgba(15,5,2,0.55)), url(/header-bg.png)',
            backgroundSize: 'cover, cover',
            backgroundPosition: 'center, center bottom',
            backgroundColor: '#1f0c05',
          }}
        />

        <div style={{ backgroundColor: 'rgba(244, 239, 230, 0.97)' }}>
          <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-3 pb-2.5 flex gap-2.5 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search (e.g. Macallan 18 Showcase)"
              className="w-full pl-10 pr-9 py-2.5 bg-white border border-stone-300 rounded-md text-base text-stone-900 placeholder-stone-400 focus:outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-700/20 transition"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 p-1 -m-1" aria-label="Clear search">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => { setEditingBottle(null); setShowAdd(true); }}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-stone-900 text-stone-50 rounded-md hover:bg-stone-800 active:scale-[0.98] transition text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add</span>
          </button>
        </div>

        {searchTerms.length > 1 && (
          <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-stone-500 uppercase tracking-wider">Matching all:</span>
            {searchTerms.map((term, i) => (
              <span key={i} className="inline-flex items-center px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-medium border border-amber-200">
                {term}
              </span>
            ))}
          </div>
        )}

        <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-3 flex gap-2 items-stretch">
          <div className="relative flex-1">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
            <select
              value={filterLocation}
              onChange={e => setFilterLocation(e.target.value)}
              className="appearance-none w-full pl-9 pr-8 py-2 bg-white border border-stone-300 rounded-md text-stone-700 text-sm focus:outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-700/20 transition truncate"
            >
              <option value="">All locations</option>
              {knownLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
          </div>
          <div className="relative flex-1">
            <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="appearance-none w-full pl-9 pr-8 py-2 bg-white border border-stone-300 rounded-md text-stone-700 text-sm focus:outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-700/20 transition truncate"
            >
              <option value="addedAt">Recently added</option>
              <option value="name">Name (A→Z)</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
          </div>
        </div>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-24">
        {loading ? null : bottles.length === 0 ? (
          <EmptyState onAdd={() => { setEditingBottle(null); setShowAdd(true); }} />
        ) : filteredBottles.length === 0 ? (
          <div className="text-center py-24">
            <div className="text-stone-500 text-sm">No results</div>
            <button onClick={() => { setSearchQuery(''); setFilterLocation(''); }} className="text-amber-700 text-sm mt-2 hover:underline">
              Reset filters
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-stone-200/80 bg-white border border-stone-200 rounded-lg overflow-hidden shadow-sm">
            {filteredBottles.map(b => (
              <BottleRow key={b.id} bottle={b} onEdit={() => { setEditingBottle(b); setShowAdd(true); }} />
            ))}
          </ul>
        )}

        {filteredBottles.length > 0 && filteredBottles.length !== bottles.length && (
          <div className="text-center text-xs text-stone-500 mt-6 num">
            Showing {filteredBottles.length} of {bottles.length}
          </div>
        )}
      </main>

      {showAdd && (
        <BottleForm
          bottle={editingBottle}
          bottles={bottles}
          onClose={() => { setShowAdd(false); setEditingBottle(null); }}
          onSave={(data) => {
            if (editingBottle) updateBottle(editingBottle.id, data);
            else addBottle(data);
            setShowAdd(false);
            setEditingBottle(null);
          }}
          onDelete={editingBottle ? () => {
            deleteBottle(editingBottle.id);
            setShowAdd(false);
            setEditingBottle(null);
          } : null}
        />
      )}

      {showMenu && (
        <BackupModal
          bottles={bottles}
          onImport={handleImport}
          onClose={() => setShowMenu(false)}
        />
      )}
    </div>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div className="text-center py-24">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 text-amber-800 mb-5">
        <Wine className="w-7 h-7" />
      </div>
      <h2 className="font-display text-2xl text-stone-900 mb-2 font-semibold">Your collection is empty</h2>
      <p className="text-stone-600 text-sm mb-6">Add your first bottle to start your whiskey library.</p>
      <button onClick={onAdd} className="inline-flex items-center gap-2 px-5 py-2.5 bg-stone-900 text-stone-50 rounded-md hover:bg-stone-800 transition text-sm font-medium">
        <Plus className="w-4 h-4" /> Add your first bottle
      </button>
    </div>
  );
}

function BottleRow({ bottle, onEdit }) {
  const memoOneLine = bottle.memo ? bottle.memo.replace(/\s+/g, ' ') : '';
  const isFinished = !!bottle.finishedAt;

  // Sub-line content priority:
  //   1. Memo (if exists)
  //   2. Otherwise, Opened/Finished dates as fallback
  // The sub-line always renders (with \u00A0 fallback) so every row has the same height.
  let subParts = [];
  if (memoOneLine) {
    subParts = [{ key: 'memo', text: memoOneLine, cls: 'text-stone-700' }];
  } else {
    if (bottle.openedAt) {
      subParts.push({ key: 'opened', text: `Opened ${formatDate(bottle.openedAt)}`, cls: 'text-amber-700 font-medium' });
    }
    if (bottle.finishedAt) {
      subParts.push({ key: 'finished', text: `Finished ${formatDate(bottle.finishedAt)}`, cls: 'text-red-700 font-semibold' });
    }
  }

  return (
    <li>
      <button
        onClick={onEdit}
        className="w-full text-left px-4 sm:px-5 py-2 hover:bg-stone-50 active:bg-stone-100 transition-colors block"
      >
        <div className="flex items-baseline justify-between gap-2 sm:gap-3">
          <h3 className={`font-display text-[15px] leading-tight truncate font-semibold tracking-tight ${
            isFinished ? 'text-stone-500 line-through decoration-stone-400' : 'text-stone-900'
          }`}>
            {bottle.name}
          </h3>
          {bottle.location && (
            <div className={`flex-shrink-0 flex items-center gap-1 text-xs ${
              isFinished ? 'text-stone-400' : 'text-stone-500'
            }`}>
              <MapPin className="w-3 h-3" />
              <span className="max-w-[110px] sm:max-w-[200px] truncate">{bottle.location}</span>
            </div>
          )}
        </div>
        <div className="text-xs leading-4 mt-0.5 truncate">
          {subParts.length > 0 ? (
            subParts.map((part, i) => (
              <span key={part.key}>
                {i > 0 && <span className="text-stone-400 mx-1.5">·</span>}
                <span className={part.cls}>{part.text}</span>
              </span>
            ))
          ) : '\u00A0'}
        </div>
      </button>
    </li>
  );
}

function BottleForm({ bottle, bottles, onClose, onSave, onDelete }) {
  const [name, setName]             = useState(bottle?.name || '');
  const [location, setLocation]     = useState(bottle?.location || '');
  const [memo, setMemo]             = useState(bottle?.memo || '');
  const [openedAt, setOpenedAt]     = useState(bottle?.openedAt || '');
  const [finishedAt, setFinishedAt] = useState(bottle?.finishedAt || '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  const similar = useMemo(() =>
    findSimilar(bottles, name, bottle?.id),
    [bottles, name, bottle?.id]
  );

  const knownLocations = useMemo(() =>
    Array.from(new Set(bottles.map(b => b.location).filter(Boolean))).sort(),
    [bottles]
  );

  function handleSubmit(e) {
    e?.preventDefault?.();
    if (!name.trim()) { setError('Please enter a name.'); return; }
    onSave({
      name: name.trim(),
      location: location.trim(),
      memo: memo.trim(),
      openedAt: openedAt || '',
      finishedAt: finishedAt || '',
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(28, 25, 23, 0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full sm:max-w-2xl max-h-[94vh] flex flex-col rounded-t-2xl sm:rounded-xl border border-stone-200 shadow-2xl"
        style={{ backgroundColor: '#f4efe6' }}
      >
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-stone-200 flex-shrink-0">
          <h2 className="font-display text-xl text-stone-900 font-semibold">
            {bottle ? 'Edit Bottle' : 'Add New Bottle'}
          </h2>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-700 p-1.5 -mr-1.5" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 sm:px-6 py-5 space-y-5 flex-1">
          {!bottle && similar.length > 0 && (
            <div className="bg-amber-50 border border-amber-300 rounded-md p-3.5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-700" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-amber-900">Similar bottle already in collection</div>
                  <ul className="mt-2 space-y-1">
                    {similar.map(s => (
                      <li key={s.id} className="text-sm">
                        <span className="font-display text-[15px] text-amber-900 font-medium">{s.name}</span>
                        {s.location && <span className="text-xs text-amber-700 ml-1.5">{s.location}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <Field label="Name" required hint="Include distillery, age, vintage, edition — anything relevant — all in one line.">
            <input
              value={name}
              onChange={e => { setName(e.target.value); setError(''); }}
              placeholder="e.g., Glenfiddich 18, Macallan 18 1995, Glenfiddich 1985 Rare Collection"
              className="w-full px-3.5 py-3 bg-white border border-stone-300 rounded-md text-base text-stone-900 focus:outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-700/20"
              autoFocus
            />
          </Field>

          <Field label="Location">
            <input
              list="known-locations"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g., Living room cabinet, shelf 2"
              className="w-full px-3.5 py-3 bg-white border border-stone-300 rounded-md text-base text-stone-900 focus:outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-700/20"
            />
            <datalist id="known-locations">
              {knownLocations.map(l => <option key={l} value={l} />)}
            </datalist>
          </Field>

          <Field label="Notes">
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              rows={4}
              placeholder="Tasting notes, purchase details, anything else..."
              className="w-full px-3.5 py-3 bg-white border border-stone-300 rounded-md text-base text-stone-900 focus:outline-none focus:border-amber-700 focus:ring-2 focus:ring-amber-700/20 resize-none"
            />
          </Field>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-md">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-t border-stone-200 flex-shrink-0 flex-wrap pb-safe" style={{ backgroundColor: 'rgba(255,255,255,0.4)' }}>
          <div className="flex items-center gap-2 flex-wrap">
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  if (confirmDelete) onDelete();
                  else setConfirmDelete(true);
                }}
                onBlur={() => setConfirmDelete(false)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors ${
                  confirmDelete
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'text-red-700 hover:bg-red-50'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                {confirmDelete ? 'Click again to confirm' : 'Delete'}
              </button>
            )}
            <DateButton
              value={openedAt}
              onChange={setOpenedAt}
              label="Mark Opened"
              prefix="Opened"
              accentColor="amber"
            />
            <DateButton
              value={finishedAt}
              onChange={setFinishedAt}
              label="Mark Finished"
              prefix="Finished"
              accentColor="stone"
            />
          </div>

          <div className="flex gap-2 ml-auto">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-stone-700 hover:bg-stone-100 rounded-md transition-colors">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-5 py-2 text-sm bg-stone-900 text-stone-50 hover:bg-stone-800 rounded-md transition-colors font-medium"
            >
              {bottle ? 'Save' : 'Add'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function DateButton({ value, onChange, label, prefix, accentColor }) {
  const [showCal, setShowCal] = useState(false);

  const isSet = !!value;
  let cls;
  if (isSet) {
    cls = accentColor === 'amber'
      ? 'text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300'
      : 'text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-300';
  } else {
    cls = 'text-stone-700 hover:bg-stone-100 border border-transparent';
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowCal(s => !s)}
        className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors ${cls}`}
      >
        <Calendar className="w-4 h-4" />
        {isSet ? `${prefix} ${formatDate(value)}` : label}
      </button>

      {showCal && (
        <CalendarPopup
          value={value}
          onChange={(date) => { onChange(date); setShowCal(false); }}
          onClear={() => { onChange(''); setShowCal(false); }}
          onClose={() => setShowCal(false)}
        />
      )}
    </>
  );
}

function CalendarPopup({ value, onChange, onClear, onClose }) {
  const today = new Date();
  const initial = value ? parseDate(value) : today;
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const firstDay = new Date(viewYear, viewMonth, 1);
  const startDay = firstDay.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const trailingEmpties = 42 - startDay - daysInMonth;
  const selectedDate = value ? parseDate(value) : null;

  function prev() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function next() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }
  function pick(day) {
    onChange(formatISODate(viewYear, viewMonth, day));
  }
  function pickToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    onChange(formatISODate(today.getFullYear(), today.getMonth(), today.getDate()));
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(28, 25, 23, 0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-xl shadow-2xl border border-stone-200 p-5 pb-safe"
      >
        <div className="flex items-center justify-between mb-4">
          <button type="button" onClick={prev} className="p-2 hover:bg-stone-100 rounded-md text-stone-700 active:bg-stone-200" aria-label="Previous month">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="font-display text-base font-medium text-stone-900">
            {MONTHS[viewMonth]} {viewYear}
          </div>
          <button type="button" onClick={next} className="p-2 hover:bg-stone-100 rounded-md text-stone-700 active:bg-stone-200" aria-label="Next month">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAYS_OF_WEEK.map((d, i) => (
            <div key={i} className="text-center text-[11px] text-stone-500 uppercase tracking-wider font-semibold py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: startDay }).map((_, i) => (
            <div key={`empty-lead-${i}`} className="aspect-square" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const isSelected = selectedDate &&
              selectedDate.getFullYear() === viewYear &&
              selectedDate.getMonth() === viewMonth &&
              selectedDate.getDate() === day;
            const isToday = today.getFullYear() === viewYear &&
              today.getMonth() === viewMonth &&
              today.getDate() === day;

            let cls = 'aspect-square rounded-md text-sm transition-colors num flex items-center justify-center ';
            if (isSelected) {
              cls += 'bg-amber-700 text-white font-medium hover:bg-amber-800';
            } else if (isToday) {
              cls += 'border border-amber-700 text-amber-800 hover:bg-amber-50';
            } else {
              cls += 'text-stone-700 hover:bg-stone-100 active:bg-stone-200';
            }

            return (
              <button
                key={day}
                type="button"
                onClick={() => pick(day)}
                className={cls}
              >
                {day}
              </button>
            );
          })}
          {Array.from({ length: Math.max(0, trailingEmpties) }).map((_, i) => (
            <div key={`empty-trail-${i}`} className="aspect-square" />
          ))}
        </div>

        <div className="flex justify-between items-center mt-4 pt-4 border-t border-stone-200">
          <button type="button" onClick={pickToday} className="text-sm text-amber-700 hover:text-amber-800 font-medium px-2 py-1">
            Today
          </button>
          <div className="flex items-center gap-1">
            {value && (
              <button type="button" onClick={onClear} className="text-sm text-stone-500 hover:text-red-700 font-medium px-2 py-1">
                Clear
              </button>
            )}
            <button type="button" onClick={onClose} className="text-sm text-stone-700 hover:bg-stone-100 font-medium px-3 py-1 rounded-md">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BackupModal({ bottles, onImport, onClose }) {
  const [status, setStatus] = useState(null);
  const fileInputRef = useRef(null);

  function handleExport() {
    try {
      const data = JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        bottles
      }, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `dannys-collection-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      setStatus({
        type: 'success',
        message: `${pluralize(bottles.length, 'bottle', 'bottles')} exported.`
      });
    } catch (err) {
      setStatus({ type: 'error', message: 'Export failed: ' + (err.message || 'Unknown error') });
    }
  }

  function handleImportClick() {
    setStatus(null);
    fileInputRef.current?.click();
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        let importedBottles;
        if (Array.isArray(parsed)) {
          importedBottles = parsed;
        } else if (parsed && Array.isArray(parsed.bottles)) {
          importedBottles = parsed.bottles;
        } else {
          throw new Error('Invalid file format');
        }

        const valid = importedBottles.filter(b => b && typeof b.name === 'string');
        if (valid.length === 0) {
          throw new Error('No valid bottles in file');
        }

        const result = onImport(valid);
        setStatus({
          type: 'success',
          message: `Imported: ${result.added} new, ${result.updated} updated.`
        });
      } catch (err) {
        setStatus({ type: 'error', message: 'Import failed: ' + (err.message || 'Unknown error') });
      }
    };
    reader.onerror = () => {
      setStatus({ type: 'error', message: 'Failed to read file.' });
    };
    reader.readAsText(file);

    e.target.value = '';
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ backgroundColor: 'rgba(28, 25, 23, 0.55)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-md flex flex-col rounded-t-2xl sm:rounded-xl border border-stone-200 shadow-2xl pb-safe"
        style={{ backgroundColor: '#f4efe6' }}
      >
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-stone-200 flex-shrink-0">
          <h2 className="font-display text-xl text-stone-900 font-semibold">Backup &amp; Restore</h2>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-700 p-1.5 -mr-1.5" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-3">
          <button
            type="button"
            onClick={handleExport}
            className="w-full text-left p-4 bg-white border border-stone-200 rounded-md hover:bg-stone-50 active:bg-stone-100 transition-colors flex items-start gap-3"
          >
            <Download className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-stone-900">Export Collection</div>
              <div className="text-xs text-stone-500 mt-0.5">
                Download a JSON backup with all {pluralize(bottles.length, 'bottle', 'bottles')}.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={handleImportClick}
            className="w-full text-left p-4 bg-white border border-stone-200 rounded-md hover:bg-stone-50 active:bg-stone-100 transition-colors flex items-start gap-3"
          >
            <Upload className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium text-stone-900">Import Collection</div>
              <div className="text-xs text-stone-500 mt-0.5">
                Merge from a backup file. Same bottles get updated; new ones added.
              </div>
            </div>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            className="hidden"
          />

          {status && (
            <div className={`text-sm px-3 py-2 rounded-md ${
              status.type === 'success'
                ? 'text-green-800 bg-green-50 border border-green-200'
                : 'text-red-700 bg-red-50 border border-red-200'
            }`}>
              {status.message}
            </div>
          )}
        </div>

        <div className="px-5 sm:px-6 py-3 border-t border-stone-200 text-[11px] text-stone-500 leading-relaxed">
          Tip: Save the backup file to iCloud Drive, Google Drive, or email it to yourself. Your data is stored only on this device — back up regularly.
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <label className="block">
      <div className="text-[11px] font-semibold text-stone-700 mb-1.5 uppercase tracking-[0.15em]">
        {label}{required && <span className="text-amber-700 ml-0.5">*</span>}
      </div>
      {children}
      {hint && <div className="text-[11px] text-stone-500 mt-1.5">{hint}</div>}
    </label>
  );
}
