import { Router, type IRouter } from "express";
import { requireAuth, requireTotpEnrolled } from "../../middlewares/requireAuth";
import inquiriesAdminRouter from "./inquiries";
import transactionsAdminRouter from "./transactions";
import mediaAdminRouter from "./media";
import slotsAdminRouter from "./slots";
import articlesAdminRouter from "./articles";
import propertiesAdminRouter from "./properties";

const router: IRouter = Router();

// All /admin routes require a valid session AND completed TOTP enrollment.
// Applied at router level so no new route can accidentally ship unprotected.
router.use(requireAuth, requireTotpEnrolled);

router.use("/inquiries", inquiriesAdminRouter);
router.use("/", transactionsAdminRouter);
router.use("/media", mediaAdminRouter);
router.use("/slots", slotsAdminRouter);
router.use("/articles", articlesAdminRouter);
router.use("/properties", propertiesAdminRouter);

export default router;
