import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

type Handler = () => void;
const handlers = new Map<string, Set<Handler>>();
const api = {
  canScrollPrev: vi.fn(() => false),
  canScrollNext: vi.fn(() => true),
  scrollPrev: vi.fn(),
  scrollNext: vi.fn(),
  on: (event: string, cb: Handler) => {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(cb);
  },
  off: (event: string, cb: Handler) => handlers.get(event)?.delete(cb),
};

vi.mock('embla-carousel-react', () => ({ default: () => [vi.fn(), api] }));

const { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } = await import('./carousel');
const { act } = await import('@testing-library/react');

function Slides() {
  return (
    <Carousel>
      <CarouselContent>
        <CarouselItem>One</CarouselItem>
        <CarouselItem>Two</CarouselItem>
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );
}

describe('Carousel', () => {
  it('enables the arrows from the Embla API and follows its select events', () => {
    const { unmount } = render(<Slides />);
    expect(screen.getByRole('button', { name: /previous slide/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next slide/i })).toBeEnabled();

    api.canScrollPrev.mockReturnValue(true);
    api.canScrollNext.mockReturnValue(false);
    act(() => handlers.get('select')?.forEach(cb => cb()));
    expect(screen.getByRole('button', { name: /previous slide/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /next slide/i })).toBeDisabled();

    unmount();
    expect(handlers.get('select')?.size).toBe(0);
    expect(handlers.get('reInit')?.size).toBe(0);
  });
});
