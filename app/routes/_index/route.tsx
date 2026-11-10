import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>tdc Student Deals</h1>
        <p className={styles.text}>
          Reach verified students on the tdc app (gettdc.pk) with exclusive
          discount codes, and see exactly how much revenue they bring in.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Create student discount codes</strong>. Set up percentage
            or fixed-amount codes in your store and publish them to students on
            the tdc app in a few clicks.
          </li>
          <li>
            <strong>Track redemptions</strong>. Every order that uses a tdc
            code is recorded automatically, so you can see which deals students
            actually use.
          </li>
          <li>
            <strong>Measure ROI</strong>. View orders, revenue, discounts given
            and average order value from student shoppers in one dashboard.
          </li>
        </ul>
      </div>
    </div>
  );
}
