import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { WsAuthPanel } from "@/components/websocket/WsAuthPanel";
import { isTauriAvailable } from "@/lib/tauri";

// Mock the tauri lib
vi.mock("@/lib/tauri", () => ({
  isTauriAvailable: vi.fn(() => false),
}));

describe("WsAuthPanel", () => {
  const defaultAuth = {
    type: "none" as const,
    token: "",
    queryName: "token",
  };

  const mockOnChange = vi.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
    vi.mocked(isTauriAvailable).mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders mode selector with three options", () => {
    render(<WsAuthPanel authConfig={defaultAuth} onChange={mockOnChange} disabled={false} />);

    expect(screen.getByText("None")).toBeTruthy();
    expect(screen.getByText("Bearer Token")).toBeTruthy();
    expect(screen.getByText("Query Param")).toBeTruthy();
  });

  it("shows 'No authentication' text when type is none", () => {
    render(<WsAuthPanel authConfig={defaultAuth} onChange={mockOnChange} disabled={false} />);

    expect(screen.getByText(/No authentication will be sent/)).toBeTruthy();
  });

  it("switches to bearer mode when clicking Bearer Token button", () => {
    render(<WsAuthPanel authConfig={defaultAuth} onChange={mockOnChange} disabled={false} />);

    fireEvent.click(screen.getByText("Bearer Token"));

    expect(mockOnChange).toHaveBeenCalledWith({
      type: "bearer",
      token: "",
      queryName: "token",
    });
  });

  it("switches to query mode when clicking Query Param button", () => {
    render(<WsAuthPanel authConfig={defaultAuth} onChange={mockOnChange} disabled={false} />);

    fireEvent.click(screen.getByText("Query Param"));

    expect(mockOnChange).toHaveBeenCalledWith({
      type: "query",
      token: "",
      queryName: "token",
    });
  });

  describe("bearer mode", () => {
    const bearerAuth = {
      type: "bearer" as const,
      token: "",
      queryName: "token",
    };

    it("shows token input with Bearer token placeholder", () => {
      render(<WsAuthPanel authConfig={bearerAuth} onChange={mockOnChange} disabled={false} />);

      const input = screen.getByPlaceholderText("Bearer token...");
      expect(input).toBeTruthy();
    });

    it("shows desktop-only warning when not in Tauri", () => {
      vi.mocked(isTauriAvailable).mockReturnValue(false);
      render(<WsAuthPanel authConfig={bearerAuth} onChange={mockOnChange} disabled={false} />);

      expect(screen.getByText(/Bearer auth requires the Tauri desktop app/)).toBeTruthy();
    });

    it("calls onChange with new token when typing", () => {
      render(<WsAuthPanel authConfig={bearerAuth} onChange={mockOnChange} disabled={false} />);

      const input = screen.getByPlaceholderText("Bearer token...");
      fireEvent.change(input, { target: { value: "my-token" } });

      expect(mockOnChange).toHaveBeenCalledWith({
        type: "bearer",
        token: "my-token",
        queryName: "token",
      });
    });

    it("does not render query param name input in bearer mode", () => {
      render(<WsAuthPanel authConfig={bearerAuth} onChange={mockOnChange} disabled={false} />);

      expect(screen.queryByPlaceholderText("Query parameter name (default: token)")).toBeNull();
    });
  });

  describe("query mode", () => {
    const queryAuth = {
      type: "query" as const,
      token: "",
      queryName: "token",
    };

    it("shows token input with Token value placeholder", () => {
      render(<WsAuthPanel authConfig={queryAuth} onChange={mockOnChange} disabled={false} />);

      expect(screen.getByPlaceholderText("Token value...")).toBeTruthy();
    });

    it("shows query param name input", () => {
      render(<WsAuthPanel authConfig={queryAuth} onChange={mockOnChange} disabled={false} />);

      expect(screen.getByPlaceholderText("Query parameter name (default: token)")).toBeTruthy();
    });

    it("calls onChange with new token when typing", () => {
      render(<WsAuthPanel authConfig={queryAuth} onChange={mockOnChange} disabled={false} />);

      const input = screen.getByPlaceholderText("Token value...");
      fireEvent.change(input, { target: { value: "query-token" } });

      expect(mockOnChange).toHaveBeenCalledWith({
        type: "query",
        token: "query-token",
        queryName: "token",
      });
    });

    it("calls onChange with new queryName when typing", () => {
      render(<WsAuthPanel authConfig={queryAuth} onChange={mockOnChange} disabled={false} />);

      const input = screen.getByPlaceholderText("Query parameter name (default: token)");
      fireEvent.change(input, { target: { value: "access_token" } });

      expect(mockOnChange).toHaveBeenCalledWith({
        type: "query",
        token: "",
        queryName: "access_token",
      });
    });

    it("shows web-compatible info when not in Tauri", () => {
      vi.mocked(isTauriAvailable).mockReturnValue(false);
      render(<WsAuthPanel authConfig={queryAuth} onChange={mockOnChange} disabled={false} />);

      expect(screen.getByText(/Query param auth works in both desktop and web mode/)).toBeTruthy();
    });
  });

  describe("disabled state", () => {
    it("disables all mode buttons when disabled is true", () => {
      render(<WsAuthPanel authConfig={defaultAuth} onChange={mockOnChange} disabled={true} />);

      const buttons = screen.getAllByRole("button");
      buttons.forEach((btn) => {
        expect(btn.hasAttribute("disabled")).toBe(true);
      });
    });

    it("does not call onChange when clicking disabled buttons", () => {
      render(<WsAuthPanel authConfig={defaultAuth} onChange={mockOnChange} disabled={true} />);

      const bearerButton = screen.getByText("Bearer Token");
      fireEvent.click(bearerButton);

      // In the disabled WsAuthPanel, the mode buttons should all be disabled,
      // but the text content may still be found. We assert onChange was not called.
      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });
});
