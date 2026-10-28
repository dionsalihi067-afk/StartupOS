"use client";

import * as React from "react";

/** The signed-in user as shown in the interface. Never contains session tokens. */
export interface ClientUser {
  id: string;
  name: string;
  email: string;
}

const SessionContext = React.createContext<{ user: ClientUser; setUser: (user: ClientUser) => void } | null>(null);

export function SessionProvider({ user: initial, children }: { user: ClientUser; children: React.ReactNode }) {
  const [user, setUser] = React.useState(initial);
  React.useEffect(() => setUser(initial), [initial]);
  const value = React.useMemo(() => ({ user, setUser }), [user]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = React.useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}
