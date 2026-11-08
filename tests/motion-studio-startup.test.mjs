import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'

/**
 * Executes the actual browser entrypoint against the real HTML shell.
 * A catalog-only metadata check cannot catch a module initialization failure.
 */
test('Motion Studio initializes controls, presets and swatches without an exception', async () => {
  const html = readFileSync(new URL('../web/motion-studio.html', import.meta.url), 'utf8')
  const dom = new JSDOM(html, {
    url: 'https://red-loop.example/motion-studio.html?scene=iris-caustics&density=72&hue=255&token=private-value#session-state',
  })
  const keys = ['window', 'document', 'location', 'history', 'Element', 'Event',
    'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame']
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  const setGlobal = (key, value) => Object.defineProperty(globalThis, key, {
    configurable: true, writable: true, value,
  })

  const context = new Proxy({}, {
    get(target, name) {
      if (name === 'createRadialGradient') return () => ({ addColorStop() {} })
      return target[name] ?? (() => {})
    },
    set(target, name, value) { target[name] = value; return true },
  })

  dom.window.HTMLCanvasElement.prototype.getContext = () => context
  dom.window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({
    width: 720, height: 440, left: 0, top: 0, right: 720, bottom: 440,
  })
  dom.window.matchMedia = media => ({
    media, matches: false, addEventListener() {}, removeEventListener() {},
  })

  let nextFrame = 0
  try {
    setGlobal('window', dom.window)
    setGlobal('document', dom.window.document)
    setGlobal('location', dom.window.location)
    setGlobal('history', dom.window.history)
    setGlobal('Element', dom.window.Element)
    setGlobal('Event', dom.window.Event)
    setGlobal('requestAnimationFrame', () => ++nextFrame)
    setGlobal('cancelAnimationFrame', () => {})
    setGlobal('ResizeObserver', class { observe() {} disconnect() {} })

    await import('../web/motion-studio.js?startup-smoke')

    const document = dom.window.document
    assert.equal(document.querySelectorAll('#ui-loop-scene-list button').length, 10)
    assert.match(document.querySelector('#ui-loop-title').textContent, /Iris Caustics/)
    assert.equal(document.querySelector('#ui-loop-density').value, '72')
    assert.equal(document.querySelector('.ui-loop-swatches button[data-hue="255"]').getAttribute('aria-pressed'), 'true')
    assert.match(document.querySelector('#ui-loop-usage-source').textContent, /hue: 255/)

    const hue = document.querySelector('#ui-loop-hue')
    hue.value = '195'
    hue.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    hue.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    assert.equal(document.querySelector('.ui-loop-swatches button[data-hue="195"]').getAttribute('aria-pressed'), 'true')
    assert.match(document.querySelector('#ui-loop-usage-source').textContent, /hue: 195/)
    assert.equal(new URL(dom.window.location.href).searchParams.get('hue'), '195')
    assert.equal(new URL(dom.window.location.href).searchParams.has('token'), false)
    assert.equal(new URL(dom.window.location.href).hash, '')
    assert.deepEqual([...new URL(dom.window.location.href).searchParams.keys()], ['scene','density','depth','speed','hue'])

    assert.equal(document.querySelector('#ui-loop-play').getAttribute('aria-pressed'), 'false')
    assert.ok(document.querySelector('#ui-loop-canvas').width > 0)

    const playButton = document.querySelector('#ui-loop-play')
    const favoriteButton = document.querySelector('#ui-loop-favorite')
    const favoritesFilter = document.querySelector('#ui-loop-filters button[data-category="Gemerkte"]')
    assert.ok(favoritesFilter, 'favorites category exists from startup')
    assert.match(favoritesFilter.textContent, /Gemerkte \(0\)/)

    playButton.click()
    assert.equal(playButton.getAttribute('aria-pressed'), 'true')
    favoriteButton.click()
    assert.equal(playButton.getAttribute('aria-pressed'), 'true', 'bookmarking never pauses playback')
    assert.equal(favoriteButton.getAttribute('aria-pressed'), 'true')
    assert.match(favoritesFilter.textContent, /Gemerkte \(1\)/)

    favoritesFilter.click()
    const saved = document.querySelectorAll('#ui-loop-scene-list button')
    assert.equal(saved.length, 1, 'favorites category shows only bookmarked scenes')
    assert.equal(saved[0].dataset.scene, 'iris-caustics')
    assert.equal(saved[0].querySelector('.ui-loop-scene-favorite-marker').hidden, false)

    favoriteButton.click()
    assert.equal(playButton.getAttribute('aria-pressed'), 'true')
    assert.equal(document.querySelectorAll('#ui-loop-scene-list button').length, 0)
    assert.match(document.querySelector('.ui-loop-no-results').textContent, /Noch nichts gemerkt/)
    assert.match(favoritesFilter.textContent, /Gemerkte \(0\)/)

    document.querySelector('#ui-loop-filters button[data-category="Alle"]').click()
    assert.equal(document.querySelectorAll('#ui-loop-scene-list button').length, 10)

    // Search results must be reachable and selectable without touching a pointer.
    const searchInput = document.querySelector('#ui-loop-search')
    searchInput.value = 'Vector Bloom'
    searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    assert.equal(document.querySelector('#ui-loop-result-status').textContent, '1 Komponente gefunden')
    assert.equal(document.querySelectorAll('#ui-loop-scene-list button[data-scene]').length, 1)

    searchInput.focus()
    searchInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      key: 'ArrowDown', bubbles: true, cancelable: true,
    }))
    assert.equal(document.activeElement.dataset.scene, 'vector-bloom')
    document.activeElement.click()
    assert.match(document.querySelector('#ui-loop-title').textContent, /Vector Bloom/)
    assert.equal(new URL(dom.window.location.href).searchParams.get('scene'), 'vector-bloom')
    assert.equal(document.activeElement.dataset.scene, 'vector-bloom',
      'selection restores focus to the newly rendered desktop catalog button')

    searchInput.value = 'nothing-matches-this-scene'
    searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    assert.equal(document.querySelector('#ui-loop-result-status').textContent, '0 Komponenten gefunden')
    searchInput.focus()
    searchInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      key: 'ArrowDown', bubbles: true, cancelable: true,
    }))
    assert.equal(document.activeElement, searchInput, 'no results should not steal focus')

    searchInput.value = 'Glass Filament'
    searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    searchInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', {
      key: 'Enter', bubbles: true, cancelable: true,
    }))
    assert.match(document.querySelector('#ui-loop-title').textContent, /Glass Filament/)
    assert.equal(document.querySelector('#ui-loop-result-status').textContent, '1 Komponente gefunden')
  } finally {
    dom.window.close()
    for (const [key, original] of originals) {
      if (original) Object.defineProperty(globalThis, key, original)
      else delete globalThis[key]
    }
  }
})
