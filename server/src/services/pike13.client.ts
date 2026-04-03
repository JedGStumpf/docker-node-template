/**
 * Pike13Client — interface-first wrapper for the Pike13 API.
 *
 * Tests inject MockPike13Client. Production uses RealPike13Client.
 */

export interface Pike13UserProfile {
  id: string;
  name: string;
  email: string;
  groupIds: string[];
}

export interface Pike13AppointmentSlot {
  start: Date;
  end: Date;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface IPike13Client {
  /**
   * Exchange an OAuth authorization code for an access token.
   */
  exchangeCode(code: string): Promise<{ accessToken: string; refreshToken?: string }>;

  /**
   * Retrieve a Pike13 user profile using the provided access token.
   */
  getUserProfile(accessToken: string): Promise<Pike13UserProfile>;

  /**
   * Retrieve available appointment slots for a Pike13 staff member.
   * Returns an array of { start, end } windows.
   */
  getAvailableSlots(pike13UserId: string, dateRange: DateRange, accessToken?: string): Promise<Pike13AppointmentSlot[]>;

  /**
   * Book an instructor via Pike13 desk API.
   */
  bookInstructor(pike13UserId: string, date: Date, classSlug: string): Promise<{ appointmentId: string } | null>;
}

/**
 * Real Pike13Client — makes actual HTTP calls to the Pike13 API.
 * Uses env vars: PIKE13_CLIENT_ID, PIKE13_CLIENT_SECRET, PIKE13_REDIRECT_URI.
 */
export class RealPike13Client implements IPike13Client {
  private baseUrl = process.env.PIKE13_BASE_URL || 'https://jointheleague.pike13.com';

  async exchangeCode(code: string): Promise<{ accessToken: string; refreshToken?: string }> {
    const clientId = process.env.PIKE13_CLIENT_ID;
    const clientSecret = process.env.PIKE13_CLIENT_SECRET;
    const redirectUri = process.env.PIKE13_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Pike13 OAuth credentials not configured');
    }

    const resp = await fetch(`${this.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    if (!resp.ok) {
      throw new Error(`Pike13 token exchange failed: ${resp.status}`);
    }

    const data: any = await resp.json();
    return { accessToken: data.access_token, refreshToken: data.refresh_token };
  }

  async getUserProfile(accessToken: string): Promise<Pike13UserProfile> {
    const resp = await fetch(`${this.baseUrl}/api/v2/profile`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      throw new Error(`Pike13 get profile failed: ${resp.status}`);
    }

    const data: any = await resp.json();
    const person = data.person || data;
    return {
      id: String(person.id),
      name: person.name || person.display_name || '',
      email: person.email || '',
      groupIds: (person.tags || []).map((t: any) => String(t.id || t)),
    };
  }

  async getAvailableSlots(
    pike13UserId: string,
    dateRange: DateRange,
    accessToken?: string,
  ): Promise<Pike13AppointmentSlot[]> {
    const token = accessToken || process.env.PIKE13_SERVICE_TOKEN;
    if (!token) {
      // Degrade gracefully if no token available
      return [];
    }

    const startStr = dateRange.start.toISOString().split('T')[0];
    const endStr = dateRange.end.toISOString().split('T')[0];

    const resp = await fetch(
      `${this.baseUrl}/api/v2/staff_members/${pike13UserId}/appointments?start_at=${startStr}&end_at=${endStr}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!resp.ok) {
      throw new Error(`Pike13 get slots failed: ${resp.status}`);
    }

    const data: any = await resp.json();
    const appointments = data.appointments || data.service_sessions || [];
    return appointments.map((a: any) => ({
      start: new Date(a.start_at || a.start),
      end: new Date(a.end_at || a.end),
    }));
  }

  async bookInstructor(pike13UserId: string, date: Date, classSlug: string): Promise<{ appointmentId: string } | null> {
    const serviceToken = process.env.PIKE13_SERVICE_TOKEN;
    if (!serviceToken) {
      console.warn('Pike13: PIKE13_SERVICE_TOKEN not configured, skipping booking');
      return null;
    }

    try {
      const resp = await fetch(`${this.baseUrl}/api/v2/desk/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceToken}`,
        },
        body: JSON.stringify({
          appointment: {
            staff_member_id: pike13UserId,
            start_at: date.toISOString(),
            name: classSlug,
          },
        }),
      });
      if (!resp.ok) {
        throw new Error(`Pike13 booking failed: ${resp.status} ${resp.statusText}`);
      }
      const data: any = await resp.json();
      return { appointmentId: String(data.appointment?.id || data.id) };
    } catch (err) {
      console.error('Pike13 bookInstructor failed:', err);
      throw err;
    }
  }
}

/**
 * MockPike13Client — for use in tests.
 * Configure slot responses per pike13UserId via `setSlots`.
 */
export class MockPike13Client implements IPike13Client {
  private slotMap: Map<string, Pike13AppointmentSlot[]> = new Map();
  private shouldThrowFor: Set<string> = new Set();
  private mockProfile: Pike13UserProfile = {
    id: 'mock-pike13-id',
    name: 'Mock Instructor',
    email: 'instructor@example.com',
    groupIds: [],
  };
  private mockAdminProfile: Pike13UserProfile = {
    id: 'mock-admin-pike13-id',
    name: 'Mock Admin',
    email: 'admin@example.com',
    groupIds: [process.env.PIKE13_ADMIN_GROUP_ID || 'admin-group'],
  };

  setProfile(profile: Pike13UserProfile) {
    this.mockProfile = profile;
  }

  setSlots(pike13UserId: string, slots: Pike13AppointmentSlot[]) {
    this.slotMap.set(pike13UserId, slots);
  }

  setShouldThrow(pike13UserId: string) {
    this.shouldThrowFor.add(pike13UserId);
  }

  reset() {
    this.slotMap.clear();
    this.shouldThrowFor.clear();
  }

  async exchangeCode(_code: string): Promise<{ accessToken: string }> {
    return { accessToken: 'mock-access-token' };
  }

  async getUserProfile(_accessToken: string): Promise<Pike13UserProfile> {
    return this.mockProfile;
  }

  async getAvailableSlots(
    pike13UserId: string,
    _dateRange: DateRange,
  ): Promise<Pike13AppointmentSlot[]> {
    if (this.shouldThrowFor.has(pike13UserId)) {
      throw new Error(`Mock Pike13 error for ${pike13UserId}`);
    }
    return this.slotMap.get(pike13UserId) || [];
  }

  bookInstructorCalls: { pike13UserId: string; date: Date; classSlug: string }[] = [];

  async bookInstructor(pike13UserId: string, date: Date, classSlug: string): Promise<{ appointmentId: string } | null> {
    this.bookInstructorCalls.push({ pike13UserId, date, classSlug });
    return { appointmentId: `mock-appt-${Date.now()}` };
  }
}
