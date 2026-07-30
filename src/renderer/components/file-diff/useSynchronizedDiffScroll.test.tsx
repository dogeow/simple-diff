// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSynchronizedDiffScroll } from './useSynchronizedDiffScroll'

function ScrollHarness({ active }: { readonly active: boolean }) {
  const { leftRef, rightRef, handleScroll } = useSynchronizedDiffScroll(active)

  return (
    <>
      <div ref={leftRef} data-testid="left-scroll" onScroll={() => handleScroll('left')} />
      <div ref={rightRef} data-testid="right-scroll" onScroll={() => handleScroll('right')} />
    </>
  )
}

describe('useSynchronizedDiffScroll', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('binds the viewport observer when loading finishes after the first render', () => {
    const observe = vi.fn()
    const disconnect = vi.fn()

    class ResizeObserverMock {
      observe = observe
      disconnect = disconnect
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)

    const view = render(<ScrollHarness active={false} />)
    expect(observe).not.toHaveBeenCalled()

    view.rerender(<ScrollHarness active />)
    expect(observe).toHaveBeenCalledWith(view.getByTestId('left-scroll'))

    view.unmount()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it('copies the active pane scroll position to the opposite pane', () => {
    const view = render(<ScrollHarness active />)
    const left = view.getByTestId('left-scroll')
    const right = view.getByTestId('right-scroll')

    left.scrollTop = 180
    fireEvent.scroll(left)

    expect(right.scrollTop).toBe(180)
  })
})
