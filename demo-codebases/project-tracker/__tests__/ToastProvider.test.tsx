import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "@/components/ui/ToastProvider";

function TestConsumer({ message, type }: { message: string; type?: "success" | "error" | "info" }) {
  const { showToast } = useToast();
  return (
    <button onClick={() => showToast(message, type)} aria-label="trigger">
      Trigger
    </button>
  );
}

describe("ToastProvider", () => {
  it("renders children", () => {
    render(
      <ToastProvider>
        <div>Hello</div>
      </ToastProvider>
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("shows toast when showToast called", async () => {
    render(
      <ToastProvider>
        <TestConsumer message="It worked!" type="success" />
      </ToastProvider>
    );
    fireEvent.click(screen.getByLabelText("trigger"));
    expect(await screen.findByText("It worked!")).toBeInTheDocument();
  });

  it("dismisses toast when X clicked", async () => {
    render(
      <ToastProvider>
        <TestConsumer message="Dismiss me" />
      </ToastProvider>
    );
    fireEvent.click(screen.getByLabelText("trigger"));
    const dismissBtn = await screen.findByLabelText(/dismiss notification/i);
    fireEvent.click(dismissBtn);
    expect(screen.queryByText("Dismiss me")).toBeNull();
  });

  it("throws when useToast used outside provider", () => {
    const err = console.error;
    console.error = vi.fn();
    expect(() => render(<TestConsumer message="oops" />)).toThrow();
    console.error = err;
  });
});
