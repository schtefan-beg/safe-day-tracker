import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MiloScene } from "@/components/app/MiloScene";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("Milo interactions", () => {
  it("offers six moments, reacts to touch and returns to idle", () => {
    vi.useFakeTimers();
    render(<MiloScene claims={0} />);
    expect(screen.getByRole("group", { name: "Moments avec Milo" }).children).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: "Caresser Milo" }));
    expect(screen.getByRole("status")).toHaveTextContent("Un câlin tout doux");
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByRole("status")).toHaveTextContent("Un petit moment ensemble");
  });

  it("lets Milo sleep until explicitly woken", () => {
    vi.useFakeTimers();
    render(<MiloScene claims={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Repos", exact: true }));
    act(() => vi.advanceTimersByTime(60000));
    expect(screen.getByAltText("Milo dort paisiblement")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Réveiller Milo" })[0]);
    expect(screen.getByRole("status")).toHaveTextContent("Un petit moment ensemble");
  });

  it("offers a three-butterfly game followed by celebration", () => {
    render(<MiloScene claims={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Jouer", exact: true }));
    for (let i = 1; i <= 3; i++) fireEvent.click(screen.getByRole("button", { name: `Attraper le papillon ${i}` }));
    expect(screen.getByRole("status")).toHaveTextContent("Bravo pour ton petit pas");
  });

  it("runs three timed breathing cycles and can interrupt them", () => {
    vi.useFakeTimers();
    render(<MiloScene claims={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Respirer", exact: true }));
    expect(screen.getByRole("status")).toHaveTextContent("Inspire doucement · 4");
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByRole("status")).toHaveTextContent("Expire doucement · 4");
    act(() => vi.advanceTimersByTime(20000));
    expect(screen.getByRole("status")).toHaveTextContent("Un petit moment ensemble");
  });

  it("celebrates new quest claims without celebrating existing claims", () => {
    const { rerender } = render(<MiloScene claims={2} />);
    expect(screen.getByRole("status")).toHaveTextContent("Un petit moment ensemble");
    rerender(<MiloScene claims={3} />);
    expect(screen.getByRole("status")).toHaveTextContent("Bravo pour ton petit pas");
  });

  it("replaces the previous timer when choosing another moment", () => {
    vi.useFakeTimers();
    render(<MiloScene claims={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Câlin", exact: true }));
    act(() => vi.advanceTimersByTime(3000));
    fireEvent.click(screen.getByRole("button", { name: "Danser", exact: true }));
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("status")).toHaveTextContent("La danse des petits bonheurs");
    fireEvent.click(screen.getByRole("button", { name: "Terminer ce moment" }));
    expect(screen.getByRole("status")).toHaveTextContent("Un petit moment ensemble");
  });
});