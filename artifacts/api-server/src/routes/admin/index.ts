import { Router, type IRouter } from "express";
import { requireAuth, requireTotpEnrolled } from "../../middlewares/requireAuth";
import inquiriesAdminRouter from "./inquiries";
import transactionsAdminRouter from "./transactions";

const router: IRouter = Router();

// All /admin routes require a valid session AND completed TOTP enrollment.
// Applied at router level so no new route can accidentally ship unprotected.
router.use(requireAuth, requireTotpEnrolled);

router.use("/inquiries", inquiriesAdminRouter);
router.use("/", transactionsAdminRouter);

export default router;
