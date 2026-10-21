"use client";

import { disconnectAction } from "./actions";
import styles from "./settings.module.css";

export function DisconnectButton() {
  return (
    <form
      action={disconnectAction}
      onSubmit={(e) => {
        if (!window.confirm("Disconnect WHOOP? This revokes the app's access. Stored data stays.")) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className={styles.danger}>
        Disconnect WHOOP
      </button>
    </form>
  );
}
