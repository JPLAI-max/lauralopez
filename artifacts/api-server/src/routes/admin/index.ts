import { Router, type IRouter } from "express";
import { requireAuth, requireTotpEnrolled } from "../../middlewares/requireAuth";
import inquiriesAdminRouter from "./inquiries";
import contactsAdminRouter from "./contacts";
import transactionsAdminRouter from "./transactions";
import mediaAdminRouter from "./media";
import slotsAdminRouter from "./slots";
import articlesAdminRouter from "./articles";
import propertiesAdminRouter from "./properties";
import settingsAdminRouter from "./settings";
import campaignTemplatesAdminRouter from "./campaign-templates";
import campaignsAdminRouter from "./campaigns";
import marketingTemplatesAdminRouter from "./marketing-templates";
import intelAdminRouter from "./intel";

const router: IRouter = Router();

// All /admin routes require a valid session AND completed TOTP enrollment.
// Applied at router level so no new route can accidentally ship unprotected.
router.use(requireAuth, requireTotpEnrolled);

router.use("/inquiries",           inquiriesAdminRouter);
router.use("/contacts",            contactsAdminRouter);
router.use("/",                    transactionsAdminRouter);
router.use("/media",               mediaAdminRouter);
router.use("/slots",               slotsAdminRouter);
router.use("/articles",            articlesAdminRouter);
router.use("/properties",          propertiesAdminRouter);
router.use("/settings",            settingsAdminRouter);
router.use("/campaign-templates",  campaignTemplatesAdminRouter);
router.use("/marketing-templates", marketingTemplatesAdminRouter);
router.use("/intel",               intelAdminRouter);
router.use("/",                    campaignsAdminRouter);

export default router;
