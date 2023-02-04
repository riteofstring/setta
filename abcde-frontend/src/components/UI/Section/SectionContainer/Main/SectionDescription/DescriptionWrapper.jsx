import { motion } from "framer-motion";
export function DescriptionWrapper({ descVis, children }) {
  const variants = {
    ease: "easeOut",

    initial: { opacity: 0, height: 0 },
    open: {
      opacity: 1,
      height: "auto",
    },
    collapsed: { opacity: 0, height: 0 },
  };

  return (
    <motion.div
      layout
      className="overflow-hidden rounded-3xl"
      variants={variants}
      initial={"initial"}
      animate={descVis ? "open" : "collapsed"}
    >
      <div className="py-8">{children}</div>
    </motion.div>
  );
}
