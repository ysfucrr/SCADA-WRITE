import "next-auth";

declare module "next-auth" {
  interface User {
    username?: string;
    role?: string;
    permissions?: {
      dashboard?: boolean;
      users?: boolean;
      units?: boolean;
      trendLog?: boolean;
      periodicReports?: boolean;
      billing?: boolean;
    };
    buildingPermissions?: any
  }

  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      username?: string;
      role?: string;
      permissions?: {
        dashboard?: boolean;
        users?: boolean;
        units?: boolean;
        trendLog?: boolean;
        periodicReports?: boolean;
        billing?: boolean;
      };
      buildingPermissions?: any
    }
  }

  declare module "next-auth/jwt" {
    interface JWT {
      role?: string;
      permissions?: {
        dashboard?: boolean;
        users?: boolean;
        units?: boolean;
        trendLog?: boolean;
        periodicReports?: boolean;
        billing?: boolean;
      };
      buildingPermissions?: any
    }
  }
}
