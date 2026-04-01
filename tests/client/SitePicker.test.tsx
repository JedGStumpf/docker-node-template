import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SitePicker from '../../client/src/components/SitePicker';

describe('SitePicker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders fetched site list and calls onChange when selected', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ([
        { id: 11, name: 'Oak Library', address: '1 Main', city: 'Austin', state: 'TX', zipCode: '78701' },
      ]),
    })) as any);

    const onChange = vi.fn();
    render(<SitePicker value={null} onChange={onChange} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Recognized Site')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Recognized Site'), { target: { value: '11' } });
    expect(onChange).toHaveBeenCalledWith(11);
  });

  it('shows empty-state message when no sites are available', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })) as any);

    render(<SitePicker value={null} onChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/No recognized sites yet/i)).toBeInTheDocument();
    });
  });

  it('supports Not listed option by returning null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ([
        { id: 22, name: 'Elm School', address: '2 Main', city: 'Dallas', state: 'TX', zipCode: '75201' },
      ]),
    })) as any);

    const onChange = vi.fn();
    render(<SitePicker value={22} onChange={onChange} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Recognized Site')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Recognized Site'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
