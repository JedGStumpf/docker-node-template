import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EmailQueueAdmin from '../../client/src/pages/admin/EmailQueueAdmin';

function renderPage(mockData?: { rows: any[]; total: number }) {
  const defaultData = { rows: [], total: 0, page: 1, limit: 20 };
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/admin/email-queue') && !url.includes('/retry')) {
      return { ok: true, json: async () => mockData || defaultData } as Response;
    }
    if (url.includes('/retry')) {
      return { ok: true, json: async () => ({ id: 'e1', status: 'pending' }) } as Response;
    }
    throw new Error(`Unexpected URL: ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock as any);

  render(
    <MemoryRouter initialEntries={['/admin/email-queue']}>
      <Routes>
        <Route path="/admin/email-queue" element={<EmailQueueAdmin />} />
      </Routes>
    </MemoryRouter>,
  );

  return { fetchMock };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('EmailQueueAdmin', () => {
  it('renders heading and status tabs', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Email Queue')).toBeInTheDocument();
    });
    expect(screen.getByTestId('status-tabs')).toBeInTheDocument();
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Dead')).toBeInTheDocument();
  });

  it('displays empty state', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No entries')).toBeInTheDocument();
    });
  });

  it('lists queue entries', async () => {
    renderPage({
      rows: [
        { id: 'e1', recipient: 'user@test.com', subject: 'Hello', status: 'pending', attempts: 0, lastError: null, createdAt: '2026-01-01T00:00:00Z' },
        { id: 'e2', recipient: 'dead@test.com', subject: 'Failed', status: 'dead', attempts: 5, lastError: 'Timeout', createdAt: '2026-01-02T00:00:00Z' },
      ],
      total: 2,
    });

    await waitFor(() => {
      expect(screen.getByText('user@test.com')).toBeInTheDocument();
      expect(screen.getByText('dead@test.com')).toBeInTheDocument();
    });
  });

  it('shows retry button only for dead entries', async () => {
    renderPage({
      rows: [
        { id: 'e1', recipient: 'user@test.com', subject: 'Hello', status: 'pending', attempts: 0, lastError: null, createdAt: '2026-01-01T00:00:00Z' },
        { id: 'e2', recipient: 'dead@test.com', subject: 'Failed', status: 'dead', attempts: 5, lastError: 'Timeout', createdAt: '2026-01-02T00:00:00Z' },
      ],
      total: 2,
    });

    await waitFor(() => {
      expect(screen.getByTestId('retry-e2')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('retry-e1')).not.toBeInTheDocument();
  });

  it('calls retry endpoint and reloads', async () => {
    const { fetchMock } = renderPage({
      rows: [
        { id: 'e2', recipient: 'dead@test.com', subject: 'Failed', status: 'dead', attempts: 5, lastError: 'Timeout', createdAt: '2026-01-02T00:00:00Z' },
      ],
      total: 1,
    });

    await waitFor(() => {
      expect(screen.getByTestId('retry-e2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('retry-e2'));

    await waitFor(() => {
      const retryCalls = fetchMock.mock.calls.filter(
        (call: any) => String(call[0]).includes('/retry')
      );
      expect(retryCalls).toHaveLength(1);
    });
  });

  it('filters by status tab click', async () => {
    const { fetchMock } = renderPage();

    await waitFor(() => {
      expect(screen.getByText('Email Queue')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Failed'));

    await waitFor(() => {
      const failedCalls = fetchMock.mock.calls.filter(
        (call: any) => String(call[0]).includes('status=failed')
      );
      expect(failedCalls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
