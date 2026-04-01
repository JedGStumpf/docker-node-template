import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AdminRequests from '../../client/src/pages/admin/AdminRequests';
import AdminRequestDetail from '../../client/src/pages/admin/AdminRequestDetail';

describe('Admin requests v2 client flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('filters requests via status tab and search input', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/admin/requests?')) {
        return {
          ok: true,
          json: async () => ({
            requests: [
              {
                id: 'req-1',
                requesterName: 'Bob',
                requesterEmail: 'bob@example.com',
                classSlug: 'python-intro',
                status: 'discussing',
                createdAt: new Date().toISOString(),
                emailThreadAddress: null,
                asanaTaskId: null,
              },
            ],
            total: 1,
            page: 1,
            limit: 20,
          }),
        } as Response;
      }
      throw new Error('Unexpected URL');
    });
    vi.stubGlobal('fetch', fetchMock as any);

    render(
      <MemoryRouter>
        <AdminRequests />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Discussing' }));
    fireEvent.change(screen.getByLabelText('Search requests'), { target: { value: 'bob' } });

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('status=discussing'))).toBe(true);
      expect(calls.some((u) => u.includes('search=bob'))).toBe(true);
    });
  });

  it('loads request detail and updates status', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/admin/requests/req-42')) {
        return {
          ok: true,
          json: async () => ({
            id: 'req-42',
            requesterName: 'Alice',
            requesterEmail: 'alice@example.com',
            classSlug: 'python-intro',
            zipCode: '90210',
            status: 'new',
            emailThreadAddress: 'req-42@threads.example.org',
            asanaTaskId: 'task-42',
            site: { id: 1, name: 'Central Library' },
          }),
        } as Response;
      }
      if (url.endsWith('/api/admin/requests/req-42/status') && init?.method === 'PUT') {
        return {
          ok: true,
          json: async () => ({
            id: 'req-42',
            requesterName: 'Alice',
            requesterEmail: 'alice@example.com',
            classSlug: 'python-intro',
            zipCode: '90210',
            status: 'dates_proposed',
            emailThreadAddress: 'req-42@threads.example.org',
            asanaTaskId: 'task-42',
            site: { id: 1, name: 'Central Library' },
          }),
        } as Response;
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock as any);

    render(
      <MemoryRouter initialEntries={['/admin/requests/req-42']}>
        <Routes>
          <Route path="/admin/requests/:id" element={<AdminRequestDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Alice/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'scheduled' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Status' }));

    await waitFor(() => {
      expect(screen.getByText('Status updated')).toBeInTheDocument();
    });
  });
});
