import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock supabase
const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignIn(...args),
      signUp: (...args: unknown[]) => mockSignUp(...args),
    },
  },
}));

// Mock sonner toast
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

import { AuthCard } from "@/components/AuthCard";

beforeEach(() => {
  vi.clearAllMocks();
  mockSignIn.mockResolvedValue({ error: null });
  mockSignUp.mockResolvedValue({ error: null });
});

describe("AuthCard", () => {
  it("renders email and password inputs", () => {
    render(<AuthCard />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("renders sign-in button by default", () => {
    render(<AuthCard />);
    expect(screen.getByRole("button", { name: /login/i })).toBeInTheDocument();
  });

  it("renders AUTHENTICATE title by default", () => {
    render(<AuthCard />);
    expect(screen.getByText("AUTHENTICATE")).toBeInTheDocument();
  });

  it("toggles to sign-up mode", () => {
    render(<AuthCard />);
    fireEvent.click(screen.getByText(/new user\? create account/i));
    expect(screen.getByText("CREATE ACCOUNT")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /register/i })).toBeInTheDocument();
  });

  it("shows validation error for invalid email", async () => {
    render(<AuthCard />);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    fireEvent.change(emailInput, { target: { value: "not-an-email" } });
    fireEvent.change(passwordInput, { target: { value: "123456" } });
    fireEvent.submit(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Invalid email address");
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("shows validation error for short password", async () => {
    render(<AuthCard />);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    fireEvent.change(emailInput, { target: { value: "user@test.com" } });
    fireEvent.change(passwordInput, { target: { value: "12" } });
    fireEvent.submit(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "Password must be at least 6 characters"
      );
    });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("calls signInWithPassword on valid login", async () => {
    render(<AuthCard />);
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    fireEvent.change(emailInput, { target: { value: "user@test.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });
    fireEvent.submit(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith({
        email: "user@test.com",
        password: "password123",
      });
    });
  });

  it("shows error toast on failed login", async () => {
    mockSignIn.mockResolvedValueOnce({
      error: new Error("Invalid login credentials"),
    });

    render(<AuthCard />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@test.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "wrongpassword" },
    });
    fireEvent.submit(screen.getByRole("button", { name: /login/i }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("INVALID CREDENTIALS");
    });
  });

  // Traction (admin_traction): web sign-ups are tagged so the admin panel can split app and web
  function signUp(password = "longenough1") {
    render(<AuthCard />);
    fireEvent.click(screen.getByText(/new user\? create account/i));
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "new@test.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: password } });
    fireEvent.submit(screen.getByRole("button", { name: /register/i }));
  }

  it("tags a website sign-up with signup_source web", async () => {
    mockSignUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null });
    signUp();
    await waitFor(() => expect(mockSignUp).toHaveBeenCalled());
    const arg = mockSignUp.mock.calls[0][0];
    expect(arg.options.data).toEqual({ signup_source: "web" });
    expect(arg.options.emailRedirectTo).toMatch(/\/auth\/callback$/);
  });

  it("says it's redirecting when sign-up returns a session (email confirmation off)", async () => {
    mockSignUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: { access_token: "t" } }, error: null });
    signUp();
    await waitFor(() =>
      expect(mockToastSuccess).toHaveBeenCalledWith("ACCOUNT CREATED", { description: "Redirecting to dashboard..." }),
    );
  });
});
