import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminRequestDetail from '../../client/src/pages/admin/AdminRequestDetail';

function renderDetail(requestOverrides: Record<string, any> = {}, registrationData?: any) {
  const baseRequest = {
    id: 'req-1',
    requesterName: 'Alice',
    requesterEmail: 'alice@test.com',
    classSlug: 'yoga-101',
    zipCode: '90210',
    status: 'discussing',
    emailThreadAddress: null,
    asanaTaskId: null,
    site: { id: 1, name: 'Central Library' },
    registrationToken: null,
    proposedDates: [],
    minHeadcount: null,
    votingDeadline: null,
    eventType: 'private',
    ...requestOverrides,
  };

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/admin/requests/req-1')) {
      return { ok: true, json: async () => baseRequest } as Response;
    }
    if (url.includes('/api/events/req-1/registrations')) {
      return {
        ok: true,
        json: async () => registrationData || { registrations: [], voteTallies: {} },
      } as Response;
    }
    if (url.includes('/api/admin/requests/req-1/status')) {
      return { ok: true, json: async () => ({ ...baseRequest, status: 'dates_proposed' }) } as Response;
    }
    if (url.includes('/api/admin/requests/req-1/finalize-date')) {
      return { ok: true, json: async () => ({ ...baseRequest, status: 'confirmed', confirmedDate: '2026-06-15' }) } as Response;
    }
    if (url.endsWith('/api/admin/requests/req-1') && url) {
      return { ok: true, json: async () => baseRequest } as Response;
    }
    throw new Error(`Unexpected URL: ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock as any);

  render(
    <MemoryRouter initialEntries={['/admin/requests/req-1']}>
      <Routes>
        <Route path="/admin/requests/:id" element={<AdminRequestDetail />} />
      </Routes>
    </MemoryRouter>,
  );

  return { fetchMock, baseRequest };
}

describe('Admin Event Management UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows date proposal form when status is discussing', async () => {
    renderDetail({ status: 'discussing' });

    await waitFor(() => {
      expect(screen.getByText(/Alice/)).toBeInTheDocument();
    });

    expect(screen.getByTestId('proposed-dates-input')).toBeInTheDocument();
    expect(screen.getByTestId('min-headcount-input')).toBeInTheDocument();
    expect(screen.getByTestId('voting-deadline-input')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Propose Dates' })).toBeInTheDocument();
  });

  it('submits date proposal form', async () => {
    const { fetchMock } = renderDetail({ status: 'discussing' });

    await waitFor(() => {
      expect(screen.getByText(/Alice/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('proposed-dates-input'), {
      target: { value: '2026-06-15, 2026-06-22' },
    });
    fireEvent.change(screen.getByTestId('min-headcount-input'), {
      target: { value: '5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Propose Dates' }));

    await waitFor(() => {
      const statusCalls = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('/status'),
      );
      expect(statusCalls.length).toBeGreaterThan(0);
      const body = JSON.parse((statusCalls[0][1] as RequestInit).body as string);
      expect(body.status).toBe('dates_proposed');
      expect(body.proposedDates).toEqual(['2026-06-15', '2026-06-22']);
      expect(body.minHeadcount).toBe(5);
    });
  });

  it('shows event config panel and saves', async () => {
    const { fetchMock } = renderDetail({ status: 'discussing', minHeadcount: 3, eventType: 'private' });

    await waitFor(() => {
      expect(screen.getByTestId('event-config')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Configuration' }));

    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter((c) => {
        const init = c[1] as RequestInit | undefined;
        return init?.method === 'PUT' && String(c[0]).endsWith('/api/admin/requests/req-1');
      });
      expect(putCalls.length).toBeGreaterThan(0);
    });
  });

  it('displays registration summary with vote tallies', async () => {
    const regs = {
      registrations: [
        { id: 'r1', attendeeName: 'Bob', attendeeEmail: 'bob@test.com', numberOfKids: 2, availableDates: ['2026-06-15'], status: 'confirmed' },
        { id: 'r2', attendeeName: 'Carol', attendeeEmail: 'carol@test.com', numberOfKids: 3, availableDates: ['2026-06-15', '2026-06-22'], status: 'confirmed' },
      ],
      voteTallies: { '2026-06-15': 5, '2026-06-22': 3 },
    };

    renderDetail(
      { status: 'dates_proposed', proposedDates: ['2026-06-15', '2026-06-22'] },
      regs,
    );

    await waitFor(() => {
      expect(screen.getByTestId('registration-summary')).toBeInTheDocument();
    });

    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
    expect(screen.getByText('5 kids')).toBeInTheDocument();
    expect(screen.getByText('3 kids')).toBeInTheDocument();
  });

  it('shows finalize buttons when dates_proposed', async () => {
    renderDetail(
      { status: 'dates_proposed', proposedDates: ['2026-06-15', '2026-06-22'] },
      { registrations: [], voteTallies: {} },
    );

    await waitFor(() => {
      expect(screen.getByTestId('registration-summary')).toBeInTheDocument();
    });

    expect(screen.getByTestId('finalize-2026-06-15')).toBeInTheDocument();
    expect(screen.getByTestId('finalize-2026-06-22')).toBeInTheDocument();
  });

  it('clicking finalize triggers API call', async () => {
    const { fetchMock } = renderDetail(
      { status: 'dates_proposed', proposedDates: ['2026-06-15'] },
      { registrations: [], voteTallies: {} },
    );

    await waitFor(() => {
      expect(screen.getByTestId('finalize-2026-06-15')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('finalize-2026-06-15'));

    await waitFor(() => {
      const finalizeCalls = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('/finalize-date'),
      );
      expect(finalizeCalls.length).toBe(1);
      const body = JSON.parse((finalizeCalls[0][1] as RequestInit).body as string);
      expect(body.date).toBe('2026-06-15');
    });
  });

  it('shows shareable link when registrationToken exists', async () => {
    renderDetail({ status: 'dates_proposed', registrationToken: 'tok-abc' }, { registrations: [], voteTallies: {} });

    await waitFor(() => {
      expect(screen.getByTestId('registration-link')).toBeInTheDocument();
    });

    const link = screen.getByTestId('registration-link');
    expect(link.textContent).toContain('/events/req-1?token=tok-abc');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('hides date proposal form when not in discussing status', async () => {
    renderDetail({ status: 'new' });

    await waitFor(() => {
      expect(screen.getByText(/Alice/)).toBeInTheDocument();
    });

    expect(screen.queryByTestId('proposed-dates-input')).not.toBeInTheDocument();
  });
});
