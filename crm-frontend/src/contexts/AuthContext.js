import { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut,
} from "firebase/auth";
import { get, ref, set } from "firebase/database";
import { firebaseAuth, firebaseDb } from "@/lib/firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const profileFor = useCallback(async (authUser) => {
        const snapshot = await get(ref(firebaseDb, `usuarios/${authUser.uid}`));
        const profile = snapshot.val();
        if (!profile || profile.role === "pending") {
            throw new Error("Conta sem perfil ativo no ERP.");
        }
        return {
            id: authUser.uid,
            uid: authUser.uid,
            email: authUser.email,
            name: profile.name || profile.nome || authUser.displayName || authUser.email,
            role: profile.role,
            tenant_id: profile.tenant_id || "kuryos",
            ...profile,
        };
    }, []);

    useEffect(() => onAuthStateChanged(firebaseAuth, async (authUser) => {
        if (!authUser) {
            setUser(false);
            setLoading(false);
            return;
        }
        try {
            setUser(await profileFor(authUser));
        } catch {
            await signOut(firebaseAuth);
            setUser(false);
        } finally {
            setLoading(false);
        }
    }), [profileFor]);

    const login = async (email, password) => {
        try {
            const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
            setUser(await profileFor(credential.user));
            return { success: true };
        } catch (e) {
            return { success: false, error: e?.message || "E-mail ou senha inválidos." };
        }
    };

    const register = async (email, password, name, org_name) => {
        try {
            const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
            const profile = {
                nome: name,
                name,
                email,
                role: "pending",
                tenant_id: org_name ? String(org_name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") : "kuryos",
                created_at: new Date().toISOString(),
            };
            await set(ref(firebaseDb, `usuarios/${credential.user.uid}`), profile);
            await signOut(firebaseAuth);
            setUser(false);
            return { success: true };
        } catch (e) {
            return { success: false, error: e?.message || "Não foi possível criar a conta." };
        }
    };

    const logout = async () => {
        try { await signOut(firebaseAuth); } catch {}
        setUser(false);
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}
