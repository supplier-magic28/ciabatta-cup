export type CommittedEmailWarning = {
  code: "email_delivery_pending";
  message: string;
  recoveryPath: "/admin/health";
  deliveryKeys: string[];
};

export function committedEmailWarning(
  message: string,
  deliveryKeys: string[],
): CommittedEmailWarning {
  return { code:"email_delivery_pending",message,recoveryPath:"/admin/health",deliveryKeys };
}
