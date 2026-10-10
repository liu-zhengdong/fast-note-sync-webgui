import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MCPAccess } from "./mcp-access";

const mocks = vi.hoisted(() => ({ create: vi.fn(), vaults: vi.fn(), connection: vi.fn() }));
vi.mock("react-i18next", async importOriginal => ({ ...await importOriginal<typeof import("react-i18next")>(), useTranslation: () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue, i18n: { language: "zh" } }) }));
vi.mock("@/components/api-handle/token-handle", () => ({ useTokenHandle: () => ({ handleCreateToken: mocks.create, isLoading: false }) }));
vi.mock("@/components/api-handle/vault-handle", () => ({ useVaultHandle: () => ({ handleVaultList: mocks.vaults }) }));
vi.mock("./mcp-helpers", async importOriginal => ({ ...await importOriginal<typeof import("./mcp-helpers")>(), testMCPConnection: mocks.connection }));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.vaults.mockImplementation(async callback => callback([{ id: "1", vault: "Notes" }]));
  mocks.create.mockResolvedValue("generated-secret");
  mocks.connection.mockResolvedValue({ serverName: "Notes", protocolVersion: "2025-03-26", tools: ["read_note"] });
});

describe("MCP access page", () => {
  it("blocks empty vault selection, sends read-only MCP scope and masks the in-memory token", async () => {
    render(<MCPAccess />);
    await screen.findByLabelText("Notes");
    expect(screen.getByRole("button", { name: "创建令牌" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Notes"));
    fireEvent.click(screen.getByRole("button", { name: "创建令牌" }));
    await screen.findByText("令牌已创建");
    expect(mocks.create).toHaveBeenCalledWith("MCP", "", 30, undefined, undefined, "mcp", "*", "note_r", "Notes");
    expect(document.body.textContent).not.toContain("generated-secret");
    expect(localStorage.setItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    await screen.findByText("连接成功");
    expect(mocks.connection).toHaveBeenCalledWith(expect.stringContaining("/api/mcp"), "generated-secret", expect.any(Object), expect.any(Object));
  });
  it("only grants unrestricted vaults after an explicit all-vault choice", async () => {
    render(<MCPAccess />);
    await screen.findByLabelText("Notes");
    fireEvent.click(screen.getByLabelText("允许所有笔记库（含将来新增的库）"));
    fireEvent.click(screen.getByRole("button", { name: "创建令牌" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith("MCP", "", 30, undefined, undefined, "mcp", "*", "note_r", ""));
  });
  it("tests a supplied password-masked token and clears stale connection results on edit", async () => {
    render(<MCPAccess />);
    const input = screen.getByLabelText("MCP 令牌");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.change(input, { target: { value: "supplied-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "测试连接" }));
    await screen.findByText("连接成功");
    expect(mocks.connection).toHaveBeenCalledWith(expect.any(String), "supplied-secret", expect.any(Object), expect.any(Object));
    fireEvent.change(input, { target: { value: "other-token" } });
    expect(screen.queryByText("连接成功")).not.toBeInTheDocument();
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
});
