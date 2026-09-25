"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";

export function useUserAvatar() {
  const { data: session } = useSession();
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) {
      setImage(null);
      return;
    }

    setLoading(true);
    fetch("/api/auth/avatar")
      .then((res) => res.json())
      .then((data) => {
        setImage(data.image ?? null);
      })
      .catch(() => {
        setImage(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [session?.user?.id, session?.user?.name, session?.user?.email]);

  return { image, loading };
}
