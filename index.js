import config from 'config';
import crypto from 'crypto';
import ksort from 'ksort';
import { mapGetters } from 'vuex';

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
  computed: {
    ...mapGetters({
      totals: 'themeCart/getTotals'
    })
  },
  methods: {
    onDoPlaceOrder (additionalPayload) {
      console.log(additionalPayload);
      if (this.$store.state.cart.cartItems.length === 0) {
        this.notifyEmptyCart();
        this.$router.push(this.localizedRoute('/'));
      } else {
        if (this.getPaymentMethod() === config.fondy.paymentMethodCode) {
          this.beforePlaceOrderToFondy();
        } else {
          this.payment.paymentMethodAdditional = additionalPayload;
          this.placeOrder();
        }
      }
    },
    beforePlaceOrderToFondy () {
      if (window.fondy) {
        let parent = document.getElementById('app');
        let wrapper = document.createElement('div');
        wrapper.setAttribute('id', 'checkout_wrapper');
        parent.appendChild(wrapper);
        this.checkoutInit();
      }
    },
    getSignature ($data, $password, $encoded = true) {
      console.log($data);
      $data = Object.values($data).filter(($var) => {
        return $var !== '' && $var !== null;
      });
      $data = ksort($data);
      let $str = $password;
      $data.forEach(item => {
        $str += '|' + item;
      });
      console.log($str);
      if ($encoded) {
        let shasum = crypto.createHash('sha1');
        return shasum.update($str).digest('hex');
      } else {
        return $str;
      }
    },
    checkoutInit () {
      if (window.fondy) {
        const addInfo = {
          customer_name: `${this.payment.firstName} ${this.payment.lastName}`,
          company: this.payment.company ? this.payment.company : '',
          street: `${this.shipping.streetAddress} ${this.shipping.apartmentNumber ? this.shipping.apartmentNumber : this.shipping.streetAddress}`,
          city: this.shipping.city,
          region: this.payment.region_code ? this.payment.region_code : ''
        };
        console.log(addInfo);
        const Options = {
          options: {
            methods: ['card', 'banklinks_eu', 'wallets', 'local_methods'],
            methods_disabled: [],
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
            currency: 'UAH',
            amount: 100,
            lang: 'uk',
            order_id: `PWA Order #${new Date().getTime()}`,
            product_id: 'Fondy',
            order_desc: this.$t('Pay order №'),
            sender_email: this.payment.emailAddress,
            merchant_data: JSON.stringify(addInfo)
          }
        };
        console.log(Options);
        let signature = this.getSignature(Options.params, config.fondy.secret_key);
        Options.params.signature = signature;
        console.log(signature);
        console.log(Options);

        var app = window.fondy('#checkout_wrapper', Options)
          .$on('success', (model) => {
            console.log('success event handled');

            var order_status = model.attr('order.order_data.order_status');

            if (order_status === 'approved') {
              console.log('Order is approved. Do somethng on approve...');
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
          });
      }
    }
  }
};
