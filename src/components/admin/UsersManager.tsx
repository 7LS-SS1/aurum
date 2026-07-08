"use client";

import { useState, useTransition } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { ROLE_LABEL_TH, type Role } from "@/lib/permissions";

type ManageableRole = Extract<Role, "STAFF" | "SENIOR" | "MANAGER">;

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: ManageableRole;
  createdAt: string;
  updatedAt: string;
}

const ROLE_OPTIONS: ManageableRole[] = ["MANAGER", "SENIOR", "STAFF"];

const EMPTY_FORM = {
  email: "",
  name: "",
  password: "",
  role: "STAFF" as ManageableRole,
};

export function UsersManager({ initialUsers }: { initialUsers: UserRow[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  function startEdit(user: UserRow) {
    setEditingId(user.id);
    setEditForm({ email: user.email, name: user.name ?? "", password: "", role: user.role });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  }

  function createUser(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const user = await apiFetch<UserRow>("/api/users", {
          method: "POST",
          body: JSON.stringify({
            email: form.email,
            name: form.name || undefined,
            password: form.password,
            role: form.role,
          }),
        });
        setUsers((prev) => [...prev, user].sort((a, b) => a.email.localeCompare(b.email)));
        setForm(EMPTY_FORM);
        notify("เพิ่มผู้ใช้แล้ว");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "เพิ่มผู้ใช้ไม่สำเร็จ");
      }
    });
  }

  function saveUser(id: string) {
    startTransition(async () => {
      try {
        const user = await apiFetch<UserRow>(`/api/users/${id}`, {
          method: "PATCH",
          body: JSON.stringify({
            email: editForm.email,
            name: editForm.name || null,
            role: editForm.role,
            ...(editForm.password ? { password: editForm.password } : {}),
          }),
        });
        setUsers((prev) => prev.map((u) => (u.id === id ? user : u)));
        cancelEdit();
        notify("บันทึกผู้ใช้แล้ว");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "บันทึกผู้ใช้ไม่สำเร็จ");
      }
    });
  }

  function deleteUser(user: UserRow) {
    if (!confirm(`ลบผู้ใช้ "${user.email}"? การกระทำนี้ย้อนกลับไม่ได้`)) return;
    startTransition(async () => {
      try {
        await apiFetch(`/api/users/${user.id}`, { method: "DELETE" });
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
        notify("ลบผู้ใช้แล้ว");
      } catch (err) {
        notify(err instanceof ApiClientError ? err.message : "ลบผู้ใช้ไม่สำเร็จ");
      }
    });
  }

  return (
    <div className="ad-grid">
      <div className="panel">
        <div className="panel-head">
          <h3>ผู้ใช้ที่จัดการได้</h3>
          <span className="sub">{users.length} บัญชี</span>
        </div>
        {users.length === 0 ? (
          <div className="empty">ยังไม่มีผู้ใช้ระดับ STAFF, SENIOR หรือ MANAGER</div>
        ) : (
          <table className="dtable">
            <thead>
              <tr>
                <th>ผู้ใช้</th>
                <th>Role</th>
                <th>สร้างเมื่อ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const editing = editingId === user.id;
                return (
                  <tr key={user.id}>
                    <td>
                      {editing ? (
                        <div className="user-edit-fields">
                          <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                          <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="ชื่อ" />
                          <input
                            type="password"
                            value={editForm.password}
                            onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                            placeholder="รหัสผ่านใหม่ (ไม่บังคับ)"
                          />
                        </div>
                      ) : (
                        <div className="user-cell">
                          <strong>{user.name || user.email}</strong>
                          <span>{user.email}</span>
                        </div>
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value as ManageableRole })}>
                          {ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABEL_TH[role]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="badge gold">{ROLE_LABEL_TH[user.role]}</span>
                      )}
                    </td>
                    <td>{new Date(user.createdAt).toLocaleDateString("th-TH")}</td>
                    <td>
                      <div className="actions">
                        {editing ? (
                          <>
                            <button disabled={pending} onClick={() => saveUser(user.id)}>
                              บันทึก
                            </button>
                            <button disabled={pending} onClick={cancelEdit}>
                              ยกเลิก
                            </button>
                          </>
                        ) : (
                          <>
                            <button disabled={pending} onClick={() => startEdit(user)}>
                              แก้ไข/ตั้งค่า
                            </button>
                            <button className="danger" disabled={pending} onClick={() => deleteUser(user)}>
                              ลบ
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="rail">
        <div className="panel">
          <div className="panel-head">
            <span className="n">+</span>
            <h3>เพิ่มผู้ใช้</h3>
          </div>
          <form onSubmit={createUser}>
            <div className="field">
              <label>
                Email <span className="req">*</span>
              </label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div className="field">
              <label>ชื่อ</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>
                Role <span className="req">*</span>
              </label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as ManageableRole })}>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABEL_TH[role]}
                  </option>
                ))}
              </select>
              <div className="hint">สร้างได้เฉพาะ role ที่ต่ำกว่า HEAD</div>
            </div>
            <div className="field">
              <label>
                Password <span className="req">*</span>
              </label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
            </div>
            <button className="btn btn-gold btn-block" type="submit" disabled={pending}>
              เพิ่มผู้ใช้
            </button>
          </form>
        </div>
      </div>

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}
