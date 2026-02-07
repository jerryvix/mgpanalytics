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
});
