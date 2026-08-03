import { Router, type IRouter } from "express";
import healthRouter from "./health";
import inquiriesRouter from "./inquiries";
import authRouter from "./auth";
import adminRouter from "./admin/index";
import calendarRouter from "./calendar";

const router: IRouter = Router();

router.use("/", healthRouter);
router.use("/", inquiriesRouter);
router.use("/", authRouter);
router.use("/admin", adminRouter);
router.use("/", calendarRouter);

export default router;
