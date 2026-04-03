import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminRequestDetail from '../../client/src/pages/admin/AdminRequestDetail';

function renderDetail(requestOverrides: Record<string, any> = {}, registrationData?: any) {
  const baseRequest = {
    id: 'req-1',
    requesterName: 'Alice',
    requesterEmail: 'alice@test.com',
    classSlug: 'yoga-101',
    zipCode: '90210',
    status: 'confirmed',
    emailThreadAddress: null,
    asanaTaskId: null,
    site: { id: 1, name: 'Central Library' },
    registrationToken: 'tok123',
    proposedDates: ['2026-06-15'],
    minHeadcount: null,
    votingDeadline: null,
    eventType: 'public',
    meetupEventUrl: null,
    meetupRsvpCount: null,
    googleCalendarEventId: null,
    eventCapacity: null,
    ...requestOverrides,
  };

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    if (url.endsWith('/api/admin/requests/req-1') && method === 'GET') {
      return { ok: true, json: async () => baseRequest } as Response;
    }
    if (url.includes('/api/events/req-1/registrations')) {
      return {
        ok: true,
        json: async () => registrationData || { registrations: [], voteTallies: {} },
      } as Response;
    }
    if (url.endsWith('/api/admin/requests/req-1') && method === 'PUT') {
      const body = JSON.parse(init?.body as string);
      return { ok: true, json: async () => ({ ...baseRequest, ...body }) } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
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

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('AdminRequestDetail — Sprint 4 fields', () => {
  it('shows Meetup link when meetupEventUrl is present', async () => {
    renderDetail({ meetupEventUrl: 'https://meetup.com/event/123', meetupRsvpCount: 15 });
    await waitFor(() => {
      expect(screen.getByTestId('meetup-link')).toBeInTheDocument();
    });
    expect(screen.getByText('View on Meetup')).toHaveAttribute('href', 'https://meetup.com/event/123');
    expect(screen.getByText('15 RSVPs')).toBeInTheDocument();
  });

  it('hides Meetup link when meetupEventUrl is null', async () => {
    renderDetail({ meetupEventUrl: null });
    await waitFor(() => {
      expect(screen.getByText('Request Detail')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('meetup-link')).not.toBeInTheDocument();
  });

  it('shows Calendar synced indicator', async () => {
    renderDetail({ googleCalendarEventId: 'cal-abc' });
    await waitFor(() => {
      expect(screen.getByTestId('calendar-indicator')).toBeInTheDocument();
    });
    expect(screen.getByText(/Synced to Google Calendar/)).toBeInTheDocument();
  });

  it('hides Calendar indicator when no ID', async () => {
    renderDetail({ googleCalendarEventId: null });
    await waitFor(() => {
      expect(screen.getByText('Request Detail')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('calendar-indicator')).not.toBeInTheDocument();
  });

  it('shows eventCapacity input in config panel', async () => {
    renderDetail({ eventCapacity: 30 });
    await waitFor(() => {
      const input = screen.getByTestId('event-capacity-input') as HTMLInputElement;
      expect(input.value).toBe('30');
    });
  });

  it('saves eventCapacity', async () => {
    const { fetchMock } = renderDetail({ eventCapacity: null });
    await waitFor(() => {
      expect(screen.getByTestId('event-capacity-input')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('event-capacity-input'), { target: { value: '50' } });
    fireEvent.click(screen.getByText('Save Configuration'));

    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter(
        (call: any) => String(call[0]).endsWith('/api/admin/requests/req-1') && call[1]?.method === 'PUT'
      );
      expect(putCalls.length).toBeGreaterThanOrEqual(1);
      const body = JSON.parse(putCalls[0][1].body);
      expect(body.eventCapacity).toBe(50);
    });
  });

  it('shows waitlisted badge for waitlisted registration', async () => {
    renderDetail(
      { status: 'confirmed' },
      {
        registrations: [
          { id: 'r1', attendeeName: 'Bob', attendeeEmail: 'bob@test.com', numberOfKids: 2, availableDates: ['2026-06-15'], status: 'registered' },
          { id: 'r2', attendeeName: 'Carol', attendeeEmail: 'carol@test.com', numberOfKids: 1, availableDates: ['2026-06-15'], status: 'waitlisted' },
        ],
        voteTallies: { '2026-06-15': 3 },
      },
    );

    await waitFor(() => {
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });
    expect(screen.getByText('Registered')).toBeInTheDocument();
    expect(screen.getByText('Waitlisted')).toBeInTheDocument();
  });
});
