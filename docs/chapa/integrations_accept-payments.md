# Chapa Documentation

[Integrations Guides](/integrations/test-mode-vs-live-mode "Integrations Guides")Accept Payment

## Accept Payment[](#accept-payment)

This document covers payment transaction and its establishment with the help of our API, Javascript library, Popup Js or our SDKs.

When accepting a payment, a transaction is established and following every transaction carries out a complete payment method.

### Collecting Customer Information[](#collecting-customer-information)

Before carrying out the transaction, a user must provide required information such as full name, email address, the amount to transfer, etc. Below you will find a list of parameter needed:

Required FieldsOptional Fields

Parameter

Description

amount

The amount you will be charging your customer.

phone\_number _Required For [Risky Businesses](/security/high-risk-businesses)_

The customer’s phone number

Parameter

Description

email

A customer’s email address

first\_name

A customer’s first name

last\_name

A customer’s last name

phone\_number

The customer’s phone number

callback\_url

Function that runs when payment is successful. This should ideally be a script that uses the verify endpoint on the Chapa API to check the status of the transaction.

return\_url

Web address to redirect the user after payment is successful.

customization\[title\]

The customizations field (optional) allows you to customize the look and feel of the payment modal. You can set a logo, the store name to be displayed (title), and a description for the payment.

tx\_ref

A unique reference given to each transaction.

currency

The currency in which all the charges are made. Currency allowed is ETB and USD.

meta\[hide\_receipt\]

Boolean Option to hide receipt for customer

meta\[disable\_phone\_edit\]

Boolean Option to make the phone number field required

meta\[custom\_receipt\_enabled\]

Boolean Option to enable custom receipt with merchant branding (colors, logo, and footer removal)

meta\[invoices\]

Array of objects containing invoice line items to display on the receipt. Each object should have a “key” (item name) and “value” (item quantity/description).

meta\[payment\_reason\]

The purpose or reason for the payment (e.g. “Paid to Merchant via Payment Link”, “Paid for goods/services online”). This is displayed on the payment receipt.

> Phone number is not required, but if you pass phone\_number, it must be 10 digits, so it should be in 09xxxxxxxx or 07xxxxxxxx format.

### Initialize the Transaction and Get a payment link[](#initialize-the-transaction-and-get-a-payment-link)

Once all the information needed to proceed with the transaction is retrieved, the action taken further would be to associate the following information into the javascript function(chosen language) which will innately display the checkout.

**Endpoint** `https://api.chapa.co/v1/transaction/initialize`

**Method** `POST`

-   `Authorization` : Pass your secret key as a bearer token in the request header to authorize this call.

javascript

```
1var myHeaders = new Headers();2  myHeaders.append("Authorization", "Bearer CHASECK-xxxxxxxxxxxxxxxx");3  myHeaders.append("Content-Type", "application/json");45  var raw = JSON.stringify({6    "amount": "10",7    "currency": "ETB",8    "email": "abebech_bekele@gmail.com",9    "first_name": "Bilen",10    "last_name": "Gizachew",11    "phone_number": "0912345678",12    "tx_ref": "chewatatest-6669",13    "callback_url": "https://webhook.site/077164d6-29cb-40df-ba29-8a00e59a7e60",14    "return_url": "https://www.google.com/",15    "customization[title]": "Payment for my favourite merchant",16    "customization[description]": "I love online payments",17    "meta[hide_receipt]": "true",18    "meta[invoices]": "[{"key": "Paracetamol", "value": "2pcs"}, {"key": "Ibuprofen", "value": "1pcs"}]"19  });2021  var requestOptions = {22    method: 'POST',23    headers: myHeaders,24    body: raw,25    redirect: 'follow'26  };2728  fetch("https://api.chapa.co/v1/transaction/initialize", requestOptions)29    .then(response => response.text())30    .then(result => console.log(result))31    .catch(error => console.log('error', error));
```

### Successful Response

```
1{2  "message": "Hosted Link",3  "status": "success",4  "data": {5    "checkout_url": "https://checkout.chapa.co/checkout/payment/V38JyhpTygC9QimkJrdful9oEjih0heIv53eJ1MsJS6xG"6    }7  }
```

### Failed Response

```
1{2    "message": "Authorization required	",3    "status": "failed",4    "data": null5  }
```

ℹ️

Refer to our [Error Codes](/integrations/responses) page for all responses for this request.

### Redirect the user to the payment link[](#redirect-the-user-to-the-payment-link)

Now all you need to do is redirect your customer to the link returned in `data.checkout_url`, and we’ll display our checkout modal for them to complete the payment.

![Hello](/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fcheckout.02578635.png&w=3840&q=75)

### After the payment[](#after-the-payment)

Four things will happen when payment is done (successful):

1.  We’ll redirect to your set `return_url` if set.
2.  The `callback_url` will return `status`, `ref_id`, and `tx_ref` after payment is complete.
3.  We’ll send you a webhook if you have that enabled. You can find more information on [Webhooks here](/integrations/webhooks).
4.  We’ll send you an email notification (unless you’ve disabled that).

N.B: On your server, you should handle the redirect and always verify the final state of the transaction.

#### Callback Response Structure[](#callback-response-structure)

When the payment is completed, the `callback_url` will receive a `GET` request with a JSON payload containing:

```
{
  "trx_ref": "chewatatest-6669",
  "ref_id": "APqDvYw1okk2",
  "status": "success"
}
```

Parameter

Description

trx\_ref

The unique transaction reference you provided when initializing the transaction

ref\_id

Chapa’s internal reference ID for tracking the transaction

status

The status of the transaction: “pending”, “success”, “failed”, etc.

Your callback handler should verify this transaction using the verification endpoint to confirm the authenticity and get the details of the transaction.

### Verify Transaction[](#verify-transaction)

It is important to verify the transaction and confirm its status. Here is how you can [Verify a Transaction](/integrations/verify-payments).

### Webhook[](#webhook)

Chapa has event listeners that will send a message whenever a payment is successful. You can find more information on [Webhooks here](/integrations/webhooks).

### Redirection[](#redirection)

The Initialization transaction API is used for redirection. When users go for check out, it generates a link that redirects them to the payment page. Once the payment has been made the users are redirected back to the website.

### Retry[](#retry)

Chapa allows your customers to retry failed payments up to 10 times. These retry attempts are only available within a specific time interval that you can configure in your dashboard (the default interval is 60 minutes).

> **Note**: You can customize the retry time interval in your dashboard under Settings > Account Settings. The retry interval can range from 5 minutes upto 60 minutes . A screenshot is provided below to help you locate this setting.

![Retry Payment Settings](/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fretry-setting.19c57e10.jpg&w=3840&q=75)

### Customer Profile[](#customer-profile)

Chapa provides a customer management system that allows you to create and manage customer profiles directly from your dashboard. To use this feature:

1.  Enable customer profile creation in your dashboard under Settings > Account Settings
2.  Access the Customers section from your dashboard menu to manage your customer base

![Customer Profile Settings](/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fenable-customer-profile.5590b18b.jpg&w=3840&q=75) ![Customers Dashboard](/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fcustomers.6e34a265.jpg&w=3840&q=75)

Last updated on March 12, 2026

[Test Mode Vs Live Mode](/integrations/test-mode-vs-live-mode "Test Mode Vs Live Mode")[Cancel Transaction](/integrations/transaction-cancel "Cancel Transaction")