import config from 'config';
import crypto from 'crypto';
import ksort from 'ksort';
import { Logger } from '@vue-storefront/core/lib/logger';
import { currentStoreView } from '@vue-storefront/core/lib/multistore';

const addFondyCheckout = () => {
  let recaptchaScript = document.createElement('script');
  let recaptchaStyles = document.createElement('link');
  recaptchaScript.setAttribute('src', 'https://pay.fondy.eu/latest/checkout-vue/checkout.js');
  recaptchaStyles.setAttribute('rel', 'stylesheet');
  recaptchaStyles.setAttribute('href', 'https://pay.fondy.eu/latest/checkout-vue/checkout.css');
  document.head.appendChild(recaptchaScript);
  document.head.appendChild(recaptchaStyles);
};

export default {
  mounted () {
    addFondyCheckout();
  },
  methods: {
    totals () {
      return this.order.products.reduce((result, product) => {
        result += product.final_price;
        return result;
      }, 0);
    },
    async onAfterPlaceOrder (payload) {
      this.confirmation = payload.confirmation;
      if (config.fondy.paymentMethodCode === this.order.addressInformation.payment_method_code) {
        this.beforePlaceOrderToFondy(payload.confirmation);
      }
      this.$store.dispatch('checkout/setThankYouPage', true);
      this.$store.dispatch('user/getOrdersHistory', { refresh: true, useCache: true });
      Logger.debug(payload.order)();
    },
    beforePlaceOrderToFondy (order) {
      if (window.fondy && order) {
        let parent = document.getElementById('app');
        let wrapper = document.createElement('div');
        wrapper.setAttribute('id', 'checkout_wrapper');
        parent.appendChild(wrapper);
        this.checkoutInit(order);
      }
    },
    getSignature ($data, $password, $encoded = true) {
      $data = Object.values($data).filter(($var) => {
        return $var !== '' && $var !== null;
      });
      $data = ksort($data);
      let $str = $password;
      $data.forEach(item => {
        $str += ' |' + item;
      });
      if ($encoded) {
        let shasum = crypto.createHash('sha1');
        return shasum.update($str).digest('hex');
      } else {
        return $str;
      }
    },
    getProductSkus (products) {
      return products.reduce((result, product) => {
        result += result ? `, ${product.sku}` : product.sku;
        return result;
      }, '');
    },
    checkoutInit (order) {
      if (window.fondy && order) {
        const storeView = currentStoreView();
        const merchantData = {
          Fullname: `${this.payment.firstName} ${this.payment.lastName}`
        };
        const addInfo = {
          customer_zip: this.payment.zipCode,
          customer_address: `${this.shipping.streetAddress} ${this.shipping.apartmentNumber ? this.shipping.apartmentNumber : this.shipping.streetAddress}`,
          customer_state: this.payment.state,
          customer_country: this.payment.country,
          phonemobile: this.payment.phoneNumber ? this.payment.phoneNumber : '',
          account: this.payment.emailAddress ? this.payment.emailAddress : '',
          products_sku: this.getProductSkus(this.$store.state.cart.cartItems),
          order_id: order.orderNumber,
          order_total: this.totals() || 1
        };
        const Options = {
          options: {
            methods: ['card', 'banklinks_eu', 'wallets', 'local_methods'],
            methods_disabled: ['banklinks_eu', 'wallets', 'local_methods'],
            card_icons: ['mastercard', 'visa'],
            active_tab: 'card',
            fields: false,
            full_screen: true,
            button: true,
            email: true
          },
          params: {
            merchant_id: config.fondy.merchant_id,
            required_rectoken: 'y',
            currency: storeView.i18n.currencyCode,
            amount: this.totals() * 100 || 100,
            lang: String(storeView.i18n.defaultLocale).slice(0, 2),
            order_id: `${order.orderNumber}#${new Date().getTime()}`,
            product_id: 'Fondy',
            order_desc: this.$t('Pay order №') + order.orderNumber,
            sender_email: this.payment.emailAddress,
            merchant_data: JSON.stringify(merchantData),
            preauth: 'Y',
            customer_data: {
              customer_name: `${this.payment.firstName} ${this.payment.lastName}`,
              customer_zip: this.payment.zipCode,
              customer_address: `${this.shipping.streetAddress} ${this.shipping.apartmentNumber ? this.shipping.apartmentNumber : this.shipping.streetAddress}`,
              customer_city: this.payment.city,
              customer_state: this.payment.state,
              customer_country: this.payment.country,
              phonemobile: this.payment.phoneNumber ? this.payment.phoneNumber : '',
              email: this.payment.emailAddress ? this.payment.emailAddress : '',
              products_sku: this.getProductSkus(this.$store.state.cart.cartItems),
              order_id: order.orderNumber,
              order_total: this.totals() || 1
            }
          }
        };
        Options.params.reservation_data = Buffer.from(JSON.stringify(addInfo) || '').toString('base64');
        Options.params.signature = this.getSignature(Options.params, config.fondy.secret_key);
        Object.assign(Options.options, config.fondy.options || {});
        var app = window.fondy('#checkout_wrapper', Options)
          .$on('success', (model) => {
            console.log('success event handled');

            var order_status = model.attr('order.order_data.order_status');

            if (order_status === 'approved') {
              console.log('Order is approved. Do somethng on approve...');
              setTimeout(() => {
                window.fondyApp.$destroy();
                document.getElementById('checkout_wrapper').remove();
              }, 2000);
            }
          })
          .$on('error', (model) => {
            console.log('error event handled');
            var response_code = model.attr('error.code');
            var response_description = model.attr('error.message');
            console.log(
              'Order is declined: ' +
              response_code +
              ', description: ' +
              response_description
            );
            this.showNotification({
              type: 'warning',
              message: this.$t('Order is declined: ' + response_code + ', description: ' + response_description)
            });
            setTimeout(() => {
              window.fondyApp.$destroy();
              document.getElementById('checkout_wrapper').remove();
            }, 2000);
          });
        window.fondyApp = app;
      }
    }
  }
};
